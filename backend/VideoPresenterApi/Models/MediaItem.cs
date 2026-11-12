namespace VideoPresenterApi.Models;

public enum MediaKind
{
    Image = 0,
    Video = 1
}

public class MediaItem
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public string OriginalName { get; set; } = string.Empty;

    public string ContentType { get; set; } = string.Empty;

    public MediaKind Kind { get; set; }

    public long SizeBytes { get; set; }

    /// <summary>Nazwa pliku w magazynie (GUID + rozszerzenie), generowana wyłącznie przez serwer.</summary>
    public string StorageKey { get; set; } = string.Empty;

    public string Sha256 { get; set; } = string.Empty;

    public Guid UploadedByUserId { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
