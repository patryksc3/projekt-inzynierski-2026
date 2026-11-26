using VideoPresenterApi.Contracts;
using VideoPresenterApi.Models;

namespace VideoPresenterApi.Services;

public interface ISchedulesService
{
    Task<List<Schedule>> GetAllAsync(CancellationToken ct);
    Task<Schedule?> GetAsync(Guid id, CancellationToken ct);
    Task<ServiceResult<Schedule>> CreateAsync(ScheduleRequest request, CancellationToken ct);
    Task<ServiceResult<Schedule>> UpdateAsync(Guid id, ScheduleRequest request, CancellationToken ct);
    Task<bool> DeleteAsync(Guid id, CancellationToken ct);
    Task<List<Schedule>> GetForDeviceAsync(Guid deviceId, bool includePast, CancellationToken ct);
}

