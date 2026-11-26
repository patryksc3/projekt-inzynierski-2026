using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using VideoPresenterApi.Contracts;
using VideoPresenterApi.Services;

namespace VideoPresenterApi.Controllers;

[ApiController]
[Route("api/playlists")]
[Authorize]
public sealed class PlaylistsController(IPlaylistsService service) : ControllerBase
{
    [HttpGet(Name = "GetAllPlaylists")]
    public async Task<IActionResult> GetAll(CancellationToken ct)
    {
        if (!IsUserToken()) return Forbid();
        return Ok((await service.GetAllAsync(ct)).Select(PlaylistResponse.From));
    }

    [HttpGet("{id:guid}", Name = "GetPlaylist")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        if (!IsUserToken()) return Forbid();
        var playlist = await service.GetAsync(id, ct);
        return playlist is null ? NotFound() : Ok(PlaylistResponse.From(playlist));
    }

    [HttpPost(Name = "CreatePlaylist")]
    public async Task<IActionResult> Create(PlaylistRequest request, CancellationToken ct)
    {
        if (!IsUserToken()) return Forbid();
        var result = await service.CreateAsync(request, ct);
        return result.Status == ServiceStatus.Ok
            ? CreatedAtRoute("GetPlaylist", new { id = result.Value!.Id }, PlaylistResponse.From(result.Value))
            : Error(result.Status, result.Message);
    }

    [HttpPut("{id:guid}", Name = "UpdatePlaylist")]
    public async Task<IActionResult> Update(Guid id, PlaylistRequest request, CancellationToken ct)
    {
        if (!IsUserToken()) return Forbid();
        var result = await service.UpdateAsync(id, request, ct);
        return result.Status == ServiceStatus.Ok
            ? Ok(PlaylistResponse.From(result.Value!))
            : Error(result.Status, result.Message);
    }

    [HttpDelete("{id:guid}", Name = "DeletePlaylist")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        if (!IsUserToken()) return Forbid();
        var result = await service.DeleteAsync(id, ct);
        return result.Status == ServiceStatus.Ok ? NoContent() : Error(result.Status, result.Message);
    }

    private IActionResult Error(ServiceStatus status, string? message) => status switch
    {
        ServiceStatus.NotFound => NotFound(),
        ServiceStatus.Conflict => Conflict(new { error = message }),
        _ => BadRequest(new { error = message })
    };

    private bool IsUserToken() => User.FindFirstValue("token_type") == "user";
}
