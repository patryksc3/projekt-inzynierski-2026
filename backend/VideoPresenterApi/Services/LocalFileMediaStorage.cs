using System.Security.Cryptography;
using Microsoft.Extensions.Options;
using VideoPresenterApi.Configuration;

namespace VideoPresenterApi.Services;

public sealed class LocalFileMediaStorage : IMediaStorage
{
    private readonly string rootPath;

    public LocalFileMediaStorage(IOptions<MediaStorageSettings> options, IHostEnvironment environment)
    {
        var configured = options.Value.RootPath;
        rootPath = Path.GetFullPath(Path.IsPathRooted(configured)
            ? configured
            : Path.Combine(environment.ContentRootPath, configured));
        Directory.CreateDirectory(rootPath);
    }

    public async Task<StoredFile> SaveAsync(Stream content, string extension, CancellationToken cancellationToken)
    {
        var key = $"{Guid.NewGuid():N}{extension.ToLowerInvariant()}";
        var finalPath = ResolvePath(key);
        var tempPath = finalPath + ".tmp";

        try
        {
            using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
            long size = 0;

            await using (var target = new FileStream(
                tempPath, FileMode.CreateNew, FileAccess.Write, FileShare.None,
                bufferSize: 81920, useAsync: true))
            {
                var buffer = new byte[81920];
                int read;
                while ((read = await content.ReadAsync(buffer, cancellationToken)) > 0)
                {
                    hash.AppendData(buffer, 0, read);
                    await target.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
                    size += read;
                }
            }

            File.Move(tempPath, finalPath);
            return new StoredFile(key, size, Convert.ToHexStringLower(hash.GetHashAndReset()));
        }
        catch
        {
            TryDelete(tempPath);
            throw;
        }
    }

    public Stream? OpenRead(string key)
    {
        var path = ResolvePath(key);
        return File.Exists(path)
            ? new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, useAsync: true)
            : null;
    }

    public Task DeleteAsync(string key, CancellationToken cancellationToken)
    {
        TryDelete(ResolvePath(key));
        return Task.CompletedTask;
    }

    private string ResolvePath(string key)
    {
        var fullPath = Path.GetFullPath(Path.Combine(rootPath, key));
        var rootWithSeparator = rootPath.EndsWith(Path.DirectorySeparatorChar)
            ? rootPath
            : rootPath + Path.DirectorySeparatorChar;

        if (!fullPath.StartsWith(rootWithSeparator, StringComparison.Ordinal))
        {
            throw new InvalidOperationException("Nieprawidłowy klucz pliku.");
        }

        return fullPath;
    }

    private static void TryDelete(string path)
    {
        try
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
        catch (IOException)
        {
        }
    }
}
