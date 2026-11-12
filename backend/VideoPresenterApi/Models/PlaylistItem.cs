namespace VideoPresenterApi.Models;

public sealed class PlaylistItem
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid PlaylistId { get; init; }
    public required Guid MediaId { get; init; }
    public required int Position { get; init; }
    public required int DurationSeconds { get; init; }
}
