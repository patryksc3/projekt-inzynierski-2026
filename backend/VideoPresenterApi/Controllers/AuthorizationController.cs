using Microsoft.AspNetCore.Mvc;
using VideoPresenterApi.Contracts;
using VideoPresenterApi.Services;

namespace VideoPresenterApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthorizationController(
    IUserAuthorizationService authorizationService,
    IJwtTokenService jwtTokenService) : ControllerBase
{
    [HttpGet("has-any-users", Name = "HasAnyUsers")]
    [ProducesResponseType(typeof(bool), StatusCodes.Status200OK)]
    public async Task<ActionResult<bool>> HasAnyUsers(CancellationToken cancellationToken)
    {
        var hasAnyUsers = await authorizationService.HasAnyUsersAsync(cancellationToken);
        return Ok(hasAnyUsers);
    }

    [HttpPost("register-user", Name = "RegisterUser")]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> RegisterUser(
        RegisterUserRequest request,
        CancellationToken cancellationToken)
    {
        var user = await authorizationService.RegisterFirstUserAsync(
            request.Login,
            request.Password,
            cancellationToken);

        if (user is null)
        {
            return Conflict(new
            {
                error = "Konto zostało już skonfigurowane. Rejestracja pierwszego użytkownika jest wyłączona."
            });
        }

        return StatusCode(StatusCodes.Status201Created, new
        {
            user.Id,
            user.Login
        });
    }

    [HttpPost("login", Name = "Login")]
    [ProducesResponseType(typeof(LoginResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<LoginResponse>> Login(
        LoginRequest request,
        CancellationToken cancellationToken)
    {
        var user = await authorizationService.AuthenticateAsync(
            request.Login,
            request.Password,
            cancellationToken);

        if (user is null)
        {
            return Unauthorized(new { error = "Nieprawidłowy login lub hasło." });
        }

        return Ok(jwtTokenService.CreateAccessToken(user));
    }
}
