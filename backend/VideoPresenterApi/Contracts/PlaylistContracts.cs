using VideoPresenterApi.Models;

namespace VideoPresenterApi.Contracts;

public sealed record PlaylistItemInput(Guid MediaId, int DurationSeconds);

public sealed record SavePlaylistRequest(
    string Name, IReadOnlyList<PlaylistItemInput> Items, Guid? Version);

public sealed record PlaylistItemResponse(Guid Id, Guid MediaId, int Position, int DurationSeconds);

public sealed record PlaylistResponse(
    Guid Id, string Name, Guid Version, IReadOnlyList<PlaylistItemResponse> Items)
{
    public static PlaylistResponse From(Playlist playlist) => new(
        playlist.Id,
        playlist.Name,
        playlist.Version,
        playlist.Items.OrderBy(i => i.Position)
            .Select(i => new PlaylistItemResponse(i.Id, i.MediaId, i.Position, i.DurationSeconds))
            .ToArray());
}
