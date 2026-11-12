using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using VideoPresenterApi.Configuration;
using VideoPresenterApi.Data;
using VideoPresenterApi.Models;

namespace VideoPresenterApi.Services;

public sealed class MediaService(
    AppDbContext dbContext,
    IMediaStorage storage,
    IOptions<MediaStorageSettings> options) : IMediaService
{
    private const int HeaderLength = 16;
    private const string InvalidNameCharacters = "<>:\"/\\|?*";

    private static readonly Dictionary<string, (MediaKind Kind, string ContentType)> AllowedExtensions =
        new(StringComparer.OrdinalIgnoreCase)
        {
            [".jpg"] = (MediaKind.Image, "image/jpeg"),
            [".jpeg"] = (MediaKind.Image, "image/jpeg"),
            [".png"] = (MediaKind.Image, "image/png"),
            [".bmp"] = (MediaKind.Image, "image/bmp"),
            [".webp"] = (MediaKind.Image, "image/webp"),
            [".mp4"] = (MediaKind.Video, "video/mp4"),
            [".mkv"] = (MediaKind.Video, "video/x-matroska"),
            [".avi"] = (MediaKind.Video, "video/x-msvideo"),
            [".mov"] = (MediaKind.Video, "video/quicktime"),
            [".webm"] = (MediaKind.Video, "video/webm")
        };

    public async Task<UploadResult> UploadAsync(IFormFile file, Guid userId, CancellationToken cancellationToken)
    {
        if (file.Length == 0)
        {
            return new UploadResult(null, UploadError.EmptyFile, "Plik jest pusty.");
        }

        if (file.Length > options.Value.MaxFileSizeBytes)
        {
            return new UploadResult(null, UploadError.TooLarge, "Plik przekracza maksymalny dozwolony rozmiar.");
        }

        var extension = Path.GetExtension(file.FileName);
        if (!AllowedExtensions.TryGetValue(extension, out var typeInfo))
        {
            return new UploadResult(null, UploadError.UnsupportedType, "Nieobsługiwany format pliku.");
        }

        await using var input = file.OpenReadStream();

        var header = new byte[HeaderLength];
        var headerRead = await input.ReadAtLeastAsync(header, HeaderLength, throwOnEndOfStream: false, cancellationToken);
        if (!MatchesSignature(extension, header.AsSpan(0, headerRead)))
        {
            return new UploadResult(null, UploadError.UnsupportedType, "Zawartość pliku nie odpowiada jego rozszerzeniu.");
        }

        input.Seek(0, SeekOrigin.Begin);
        var stored = await storage.SaveAsync(input, extension, cancellationToken);

        try
        {
            var item = new MediaItem
            {
                OriginalName = Path.GetFileName(file.FileName),
                ContentType = typeInfo.ContentType,
                Kind = typeInfo.Kind,
                SizeBytes = stored.SizeBytes,
                StorageKey = stored.Key,
                Sha256 = stored.Sha256,
                UploadedByUserId = userId
            };

            dbContext.MediaItems.Add(item);
            await dbContext.SaveChangesAsync(cancellationToken);
            return new UploadResult(item, UploadError.None);
        }
        catch
        {
            await storage.DeleteAsync(stored.Key, CancellationToken.None);
            throw;
        }
    }

    public async Task<IReadOnlyList<MediaItem>> GetAllAsync(CancellationToken cancellationToken) =>
        await dbContext.MediaItems
            .AsNoTracking()
            .OrderByDescending(m => m.CreatedAt)
            .ToListAsync(cancellationToken);

    public Task<MediaItem?> GetAsync(Guid id, CancellationToken cancellationToken) =>
        dbContext.MediaItems
            .AsNoTracking()
            .FirstOrDefaultAsync(m => m.Id == id, cancellationToken);

    public async Task<RenameMediaResult> RenameAsync(Guid id, string? name, CancellationToken cancellationToken)
    {
        var stem = name?.Trim();
        if (string.IsNullOrEmpty(stem) || stem is "." or "..")
            return new(null, "Podaj nazwę pliku.");

        if (stem.Any(c => char.IsControl(c) || InvalidNameCharacters.Contains(c)))
            return new(null, "Nazwa pliku zawiera niedozwolone znaki.");

        var item = await dbContext.MediaItems.FirstOrDefaultAsync(m => m.Id == id, cancellationToken);
        if (item is null)
            return new(null);

        var extension = Path.GetExtension(item.OriginalName);
        if (stem.Length + extension.Length > 255)
            return new(null, "Nazwa pliku wraz z rozszerzeniem może mieć najwyżej 255 znaków.");

        item.DisplayName = stem + extension;
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
            return new(item);
        }
        catch (DbUpdateConcurrencyException)
        {
            return new(null);
        }
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken)
    {
        var item = await dbContext.MediaItems.FirstOrDefaultAsync(m => m.Id == id, cancellationToken);
        if (item is null)
        {
            return false;
        }

        dbContext.MediaItems.Remove(item);
        await dbContext.SaveChangesAsync(cancellationToken);
        await storage.DeleteAsync(item.StorageKey, cancellationToken);
        return true;
    }

    public Stream? OpenContent(MediaItem item) => storage.OpenRead(item.StorageKey);

    public Task<Stream?> OpenThumbnailAsync(MediaItem item, CancellationToken cancellationToken) =>
        storage.OpenThumbnailAsync(item.StorageKey, item.Kind == MediaKind.Video, cancellationToken);

    private static bool MatchesSignature(string extension, ReadOnlySpan<byte> h)
    {
        static bool Starts(ReadOnlySpan<byte> data, params byte[] prefix) => data.StartsWith(prefix);
        static bool At(ReadOnlySpan<byte> data, int offset, string ascii) =>
            data.Length >= offset + ascii.Length &&
            data.Slice(offset, ascii.Length).SequenceEqual(System.Text.Encoding.ASCII.GetBytes(ascii));

        return extension.ToLowerInvariant() switch
        {
            ".jpg" or ".jpeg" => Starts(h, 0xFF, 0xD8, 0xFF),
            ".png" => Starts(h, 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A),
            ".bmp" => Starts(h, 0x42, 0x4D),
            ".webp" => At(h, 0, "RIFF") && At(h, 8, "WEBP"),
            ".avi" => At(h, 0, "RIFF") && At(h, 8, "AVI "),
            ".mp4" or ".mov" => At(h, 4, "ftyp") || At(h, 4, "moov") || At(h, 4, "mdat") || At(h, 4, "wide"),
            ".mkv" or ".webm" => Starts(h, 0x1A, 0x45, 0xDF, 0xA3),
            _ => false
        };
    }
}
