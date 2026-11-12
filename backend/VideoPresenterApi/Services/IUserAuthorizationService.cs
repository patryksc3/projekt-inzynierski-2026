using VideoPresenterApi.Models;

namespace VideoPresenterApi.Services;

public interface IUserAuthorizationService
{
    Task<bool> HasAnyUsersAsync(CancellationToken cancellationToken = default);

    Task<User?> RegisterFirstUserAsync(
        string login,
        string password,
        CancellationToken cancellationToken = default);

    Task<User?> AuthenticateAsync(
        string login,
        string password,
        CancellationToken cancellationToken = default);
}
