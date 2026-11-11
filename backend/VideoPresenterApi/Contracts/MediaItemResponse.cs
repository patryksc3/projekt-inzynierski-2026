using VideoPresenterApi.Models;

namespace VideoPresenterApi.Contracts;

public sealed record MediaItemResponse(
    Guid Id,
    string OriginalName,
    string Kind,
    string ContentType,
    long SizeBytes,
    string Sha256,
    DateTimeOffset CreatedAt)
{
    public static MediaItemResponse From(MediaItem item) => new(
        item.Id,
        item.OriginalName,
        item.Kind.ToString(),
        item.ContentType,
        item.SizeBytes,
        item.Sha256,
        item.CreatedAt);
}
