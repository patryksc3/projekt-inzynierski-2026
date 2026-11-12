namespace VideoPresenterApi.Contracts;

public sealed record SaveScheduleBlockRequest(
    Guid DeviceId, Guid PlaylistId, DateTimeOffset? StartsAt, DateTimeOffset? EndsAt, Guid? Version);

public sealed record ScheduleBlockResponse(
    Guid Id, Guid DeviceId, string DeviceName, Guid PlaylistId, string PlaylistName,
    DateTimeOffset StartsAt, DateTimeOffset EndsAt, Guid Version);
