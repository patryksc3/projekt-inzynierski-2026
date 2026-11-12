namespace VideoPresenterApi.Services;

public sealed record StoredFile(string Key, long SizeBytes, string Sha256);

public interface IMediaStorage
{
    Task<StoredFile> SaveAsync(Stream content, string extension, CancellationToken cancellationToken);

    /// <summary>Zwraca strumień do odczytu albo null, gdy plik nie istnieje.</summary>
    Stream? OpenRead(string key);

    Task DeleteAsync(string key, CancellationToken cancellationToken);
}
