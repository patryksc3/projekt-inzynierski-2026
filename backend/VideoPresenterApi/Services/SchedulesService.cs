using Microsoft.EntityFrameworkCore;
using VideoPresenterApi.Contracts;
using VideoPresenterApi.Data;
using VideoPresenterApi.Models;

namespace VideoPresenterApi.Services;

public sealed class SchedulesService(AppDbContext db) : ISchedulesService
{
    public Task<List<Schedule>> GetAllAsync(CancellationToken ct) =>
        db.Schedules.AsNoTracking().Include(s => s.Devices)
            .OrderBy(s => s.StartsAt).ToListAsync(ct);

    public Task<Schedule?> GetAsync(Guid id, CancellationToken ct) =>
        db.Schedules.AsNoTracking().Include(s => s.Devices)
            .FirstOrDefaultAsync(s => s.Id == id, ct);

    public async Task<ServiceResult<Schedule>> CreateAsync(ScheduleRequest request, CancellationToken ct)
    {
        var check = await ValidateAsync(request, null, ct);
        if (check is not null) return check;

        var schedule = new Schedule();
        Apply(schedule, request);
        db.Schedules.Add(schedule);
        await db.SaveChangesAsync(ct);
        return new(ServiceStatus.Ok, schedule);
    }

    public async Task<ServiceResult<Schedule>> UpdateAsync(Guid id, ScheduleRequest request, CancellationToken ct)
    {
        var schedule = await db.Schedules.Include(s => s.Devices).FirstOrDefaultAsync(s => s.Id == id, ct);
        if (schedule is null) return new(ServiceStatus.NotFound);

        var check = await ValidateAsync(request, id, ct);
        if (check is not null) return check;

        var requested = request.DeviceIds.Distinct().ToHashSet();
        var removed = schedule.Devices.Where(d => !requested.Contains(d.DeviceId)).ToList();
        db.ScheduleDevices.RemoveRange(removed);
        var existing = schedule.Devices.Select(d => d.DeviceId).ToHashSet();
        foreach (var deviceId in requested.Where(d => !existing.Contains(d)))
        {
            schedule.Devices.Add(new ScheduleDevice { ScheduleId = schedule.Id, DeviceId = deviceId });
        }

        Apply(schedule, request, replaceDevices: false);
        await db.SaveChangesAsync(ct);
        return new(ServiceStatus.Ok, schedule);
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken ct)
    {
        var schedule = await db.Schedules.FirstOrDefaultAsync(s => s.Id == id, ct);
        if (schedule is null) return false;
        db.Schedules.Remove(schedule);
        await db.SaveChangesAsync(ct);
        return true;
    }

    public Task<List<Schedule>> GetForDeviceAsync(Guid deviceId, bool includePast, CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        return db.Schedules.AsNoTracking()
            .Include(s => s.Playlist!).ThenInclude(p => p.Items).ThenInclude(i => i.MediaItem)
            .Where(s => s.Devices.Any(d => d.DeviceId == deviceId) && (includePast || s.EndsAt > now))
            .OrderBy(s => s.StartsAt)
            .ToListAsync(ct);
    }

    private static void Apply(Schedule schedule, ScheduleRequest request, bool replaceDevices = true)
    {
        schedule.Name = request.Name.Trim();
        schedule.PlaylistId = request.PlaylistId;
        schedule.StartsAt = request.StartsAt.ToUniversalTime();
        schedule.EndsAt = request.EndsAt.ToUniversalTime();
        if (replaceDevices)
        {
            schedule.Devices = request.DeviceIds.Distinct()
                .Select(d => new ScheduleDevice { ScheduleId = schedule.Id, DeviceId = d }).ToList();
        }
    }

    private async Task<ServiceResult<Schedule>?> ValidateAsync(ScheduleRequest request, Guid? excludeId, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Trim().Length > 128)
            return new(ServiceStatus.Invalid, Message: "Nazwa harmonogramu jest wymagana (maks. 128 znaków).");
        if (request.EndsAt <= request.StartsAt)
            return new(ServiceStatus.Invalid, Message: "Data zakończenia musi być późniejsza niż data rozpoczęcia.");
        if (request.DeviceIds is null)
            return new(ServiceStatus.Invalid, Message: "Lista urządzeń jest wymagana.");
        if (!await db.Playlists.AnyAsync(p => p.Id == request.PlaylistId, ct))
            return new(ServiceStatus.Invalid, Message: "Wybrana playlista nie istnieje.");

        var deviceIds = request.DeviceIds.Distinct().ToList();
        var devices = await db.Devices.Where(d => deviceIds.Contains(d.Id)).ToListAsync(ct);
        if (devices.Count != deviceIds.Count)
            return new(ServiceStatus.Invalid, Message: "Co najmniej jedno z urządzeń nie istnieje.");

        var start = request.StartsAt.ToUniversalTime();
        var end = request.EndsAt.ToUniversalTime();
        var overlapping = await db.ScheduleDevices
            .Where(sd => deviceIds.Contains(sd.DeviceId)
                && (excludeId == null || sd.ScheduleId != excludeId)
                && sd.Schedule!.StartsAt < end && sd.Schedule.EndsAt > start)
            .Select(sd => new { sd.DeviceId, sd.ScheduleId, ScheduleName = sd.Schedule!.Name })
            .ToListAsync(ct);

        if (overlapping.Count > 0)
        {
            var names = devices.ToDictionary(d => d.Id, d => d.Name);
            var conflicts = overlapping
                .Select(o => new ScheduleConflict(o.DeviceId, names[o.DeviceId], o.ScheduleId, o.ScheduleName))
                .ToList();
            var text = string.Join("; ", conflicts.Select(c => $"urządzenie '{c.DeviceName}' ma już harmonogram '{c.ScheduleName}' w tym czasie"));
            return new(ServiceStatus.Conflict, Message: $"Konflikt harmonogramów: {text}.", Conflicts: conflicts);
        }

        return null;
    }
}

