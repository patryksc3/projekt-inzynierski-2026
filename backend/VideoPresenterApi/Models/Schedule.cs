namespace VideoPresenterApi.Models;

public class Schedule
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public string Name { get; set; } = string.Empty;

    public Guid PlaylistId { get; set; }

    public Playlist? Playlist { get; set; }

    public DateTimeOffset StartsAt { get; set; }

    public DateTimeOffset EndsAt { get; set; }

    public List<ScheduleDevice> Devices { get; set; } = [];
}

public class ScheduleDevice
{
    public Guid ScheduleId { get; set; }

    public Schedule? Schedule { get; set; }

    public Guid DeviceId { get; set; }

    public Device? Device { get; set; }
}
