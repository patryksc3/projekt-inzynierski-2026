namespace VideoPresenterApi.Models;

public sealed class Playlist
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required string Name { get; set; }
    public Guid Version { get; set; } = Guid.NewGuid();
    public List<PlaylistItem> Items { get; } = [];
}
