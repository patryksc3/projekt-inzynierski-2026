using VideoPresenterApi.Models;

namespace VideoPresenterApi.Contracts;

public sealed record PlaylistItemRequest(Guid MediaItemId, int DurationSeconds);

/// <summary>Elementy w kolejności; indeks wynika z pozycji na liście.</summary>
public sealed record PlaylistRequest(string Name, List<PlaylistItemRequest> Items);

public sealed record PlaylistItemResponse(
    Guid Id,
    Guid MediaItemId,
    string Kind,
    string OriginalName,
    int DurationSeconds,
    int Index);

public sealed record PlaylistResponse(Guid Id, string Name, List<PlaylistItemResponse> Items)
{
    public static PlaylistResponse From(Playlist p) => new(
        p.Id,
        p.Name,
        p.Items.OrderBy(i => i.Index).Select(i => new PlaylistItemResponse(
            i.Id,
            i.MediaItemId,
            i.MediaItem?.Kind.ToString() ?? string.Empty,
            i.MediaItem?.OriginalName ?? string.Empty,
            i.DurationSeconds,
            i.Index)).ToList());
}
