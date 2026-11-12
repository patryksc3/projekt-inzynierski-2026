namespace VideoPresenterApi.Models;

public sealed class ScheduleBlock
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid DeviceId { get; set; }
    public Guid PlaylistId { get; set; }
    public DateTimeOffset StartsAt { get; set; }
    public DateTimeOffset EndsAt { get; set; }
    public Guid Version { get; set; } = Guid.NewGuid();

    public Device Device { get; private set; } = null!;
    public Playlist Playlist { get; private set; } = null!;
}
