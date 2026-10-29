using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using VideoPresenterApi.Configuration;
using VideoPresenterApi.Contracts;
using VideoPresenterApi.Services;

namespace VideoPresenterApi.Controllers;

[ApiController]
[Route("api/devices")]
public sealed class DevicesController(
    IDevicesService devicesService,
    IJwtTokenService jwtTokenService,
    IOptions<DevicePairingSettings> pairingSettings) : ControllerBase
{
    [Authorize]
    [HttpGet("get-all-devices", Name = "GetAllDevices")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetAllDevices(CancellationToken cancellationToken)
    {
        if (!IsUserToken())
        {
            return Forbid();
        }

        var devices = await devicesService.GetAllAsync(cancellationToken);
        return Ok(devices);
    }

    [Authorize]
    [HttpPost("create", Name = "CreateDevice")]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Create(
        CreateDeviceRequest request,
        CancellationToken cancellationToken)
    {
        if (!IsUserToken())
        {
            return Forbid();
        }

        var device = await devicesService.CreateAsync(request.Name, cancellationToken);

        return StatusCode(StatusCodes.Status201Created, new { device.Id, device.Name });
    }

    [Authorize]
    [HttpPost("get-pair-code", Name = "GetDevicePairCode")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetPairCode(
        GetPairCodeRequest request,
        CancellationToken cancellationToken)
    {
        if (!IsUserToken())
        {
            return Forbid();
        }

        var pairCode = await devicesService.CreatePairCodeAsync(request.DeviceId, cancellationToken);
        if (pairCode is null)
        {
            return NotFound(new { error = "Nie znaleziono urządzenia." });
        }

        return Ok(new
        {
            pairCode,
            expiresInMinutes = pairingSettings.Value.PairCodeLifetimeMinutes
        });
    }

    [AllowAnonymous]
    [HttpPost("get-credentials", Name = "GetDeviceCredentials")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetCredentials(
        GetCredentialsRequest request,
        CancellationToken cancellationToken)
    {
        var password = await devicesService.CreateCredentialsAsync(request.PairCode, cancellationToken);
        if (password is null)
        {
            return BadRequest(new { error = "Kod parowania jest nieprawidłowy, wygasł lub został już użyty." });
        }

        return Ok(new { password });
    }

    [AllowAnonymous]
    [HttpPost("login", Name = "DeviceLogin")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Login(
        DeviceLoginRequest request,
        CancellationToken cancellationToken)
    {
        var device = await devicesService.AuthenticateAsync(request.Password, cancellationToken);
        if (device is null)
        {
            return Unauthorized(new { error = "Nieprawidłowe poświadczenia urządzenia." });
        }

        return Ok(jwtTokenService.CreateAccessToken(device));
    }

    private bool IsUserToken() =>
        User.Identity?.IsAuthenticated == true &&
        User.FindFirstValue("token_type") == "user";
}
