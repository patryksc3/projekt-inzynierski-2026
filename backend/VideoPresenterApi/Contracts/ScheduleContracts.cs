using VideoPresenterApi.Models;

namespace VideoPresenterApi.Contracts;

public sealed record ScheduleRequest(
    string Name,
    Guid PlaylistId,
    DateTimeOffset StartsAt,
    DateTimeOffset EndsAt,
    List<Guid> DeviceIds);

public sealed record ScheduleResponse(
    Guid Id,
    string Name,
    Guid PlaylistId,
    DateTimeOffset StartsAt,
    DateTimeOffset EndsAt,
    List<Guid> DeviceIds)
{
    public static ScheduleResponse From(Schedule s) => new(
        s.Id, s.Name, s.PlaylistId, s.StartsAt, s.EndsAt,
        s.Devices.Select(d => d.DeviceId).ToList());
}

/// <summary>Harmonogram wraz z zawartością playlisty - dla urządzenia.</summary>
public sealed record DeviceScheduleResponse(
    Guid Id,
    string Name,
    DateTimeOffset StartsAt,
    DateTimeOffset EndsAt,
    PlaylistResponse Playlist)
{
    public static DeviceScheduleResponse From(Schedule s) => new(
        s.Id, s.Name, s.StartsAt, s.EndsAt, PlaylistResponse.From(s.Playlist!));
}

public sealed record ScheduleConflict(Guid DeviceId, string DeviceName, Guid ScheduleId, string ScheduleName);
