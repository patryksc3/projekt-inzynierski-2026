namespace VideoPresenterApi.Models;

public class Playlist
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public string Name { get; set; } = string.Empty;

    public List<PlaylistItem> Items { get; set; } = [];
}

public class PlaylistItem
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid PlaylistId { get; set; }

    public Playlist? Playlist { get; set; }

    public Guid MediaItemId { get; set; }

    public MediaItem? MediaItem { get; set; }

    public int DurationSeconds { get; set; }

    /// <summary>Pozycja na playliście (od 0).</summary>
    public int Index { get; set; }
}
