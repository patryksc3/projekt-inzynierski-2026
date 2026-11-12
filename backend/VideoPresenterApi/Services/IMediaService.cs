using VideoPresenterApi.Models;

namespace VideoPresenterApi.Services;

public enum UploadError
{
    None,
    EmptyFile,
    TooLarge,
    UnsupportedType
}

public sealed record UploadResult(MediaItem? Item, UploadError Error, string? Message = null);
public sealed record RenameMediaResult(MediaItem? Item, string? Error = null);

public interface IMediaService
{
    Task<UploadResult> UploadAsync(IFormFile file, Guid userId, CancellationToken cancellationToken);

    Task<IReadOnlyList<MediaItem>> GetAllAsync(CancellationToken cancellationToken);

    Task<MediaItem?> GetAsync(Guid id, CancellationToken cancellationToken);
    Task<RenameMediaResult> RenameAsync(Guid id, string? name, CancellationToken cancellationToken);

    Task<bool> DeleteAsync(Guid id, CancellationToken cancellationToken);

    Stream? OpenContent(MediaItem item);
    Task<Stream?> OpenThumbnailAsync(MediaItem item, CancellationToken cancellationToken);
}
