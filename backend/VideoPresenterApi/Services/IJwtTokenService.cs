using VideoPresenterApi.Contracts;
using VideoPresenterApi.Models;

namespace VideoPresenterApi.Services;

public interface IJwtTokenService
{
    LoginResponse CreateAccessToken(User user);
}
