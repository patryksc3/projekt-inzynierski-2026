using VideoPresenterApi.Contracts;

namespace VideoPresenterApi.Services;

public enum ServiceStatus { Ok, NotFound, Invalid, Conflict }

public sealed record ServiceResult<T>(
    ServiceStatus Status,
    T? Value = default,
    string? Message = null,
    List<ScheduleConflict>? Conflicts = null);

