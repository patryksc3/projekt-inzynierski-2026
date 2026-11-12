using VideoPresenterApi.Models;
using VideoPresenterApi.Contracts;

namespace VideoPresenterApi.Services;

public interface IDevicesService
{
    Task<IReadOnlyList<DeviceSummary>> GetAllAsync(CancellationToken cancellationToken = default);

    Task<Device> CreateAsync(string name, CancellationToken cancellationToken = default);

    Task<string?> CreatePairCodeAsync(Guid deviceId, CancellationToken cancellationToken = default);

    Task<string?> CreateCredentialsAsync(string pairCode, CancellationToken cancellationToken = default);

    Task<Device?> AuthenticateAsync(string password, CancellationToken cancellationToken = default);
}
