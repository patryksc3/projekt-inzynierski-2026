using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Net.Http.Headers;
using VideoPresenterApi.Contracts;
using VideoPresenterApi.Data;
using VideoPresenterApi.Services;

namespace VideoPresenterApi.Controllers;

[ApiController]
[Route("api/media")]
[Authorize]
public sealed class MediaController(IMediaService mediaService) : ControllerBase
{
    [HttpPost(Name = "UploadMedia")]
    [Consumes("multipart/form-data")]
    [ProducesResponseType(typeof(MediaItemResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status413PayloadTooLarge)]
    public async Task<IActionResult> Upload(IFormFile file, CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Forbid();
        }

        var result = await mediaService.UploadAsync(file, userId, cancellationToken);
        return result.Error switch
        {
            UploadError.None => CreatedAtRoute("GetMedia", new { id = result.Item!.Id }, MediaItemResponse.From(result.Item)),
            UploadError.TooLarge => StatusCode(StatusCodes.Status413PayloadTooLarge, new { error = result.Message }),
            _ => BadRequest(new { error = result.Message })
        };
    }

    [HttpGet(Name = "GetAllMedia")]
    [ProducesResponseType(typeof(IEnumerable<MediaItemResponse>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll(CancellationToken cancellationToken)
    {
        if (!IsUserToken())
        {
            return Forbid();
        }

        var items = await mediaService.GetAllAsync(cancellationToken);
        return Ok(items.Select(MediaItemResponse.From));
    }

    [HttpGet("{id:guid}", Name = "GetMedia")]
    [ProducesResponseType(typeof(MediaItemResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Get(Guid id, CancellationToken cancellationToken)
    {
        if (!IsUserToken())
        {
            return Forbid();
        }

        var item = await mediaService.GetAsync(id, cancellationToken);
        return item is null ? NotFound() : Ok(MediaItemResponse.From(item));
    }

    [HttpPatch("{id:guid}/name", Name = "RenameMedia")]
    [ProducesResponseType(typeof(MediaItemResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Rename(Guid id, RenameMediaRequest request, CancellationToken cancellationToken)
    {
        if (!IsUserToken()) return Forbid();

        var result = await mediaService.RenameAsync(id, request.Name, cancellationToken);
        if (result.Error is not null) return BadRequest(new { error = result.Error });
        return result.Item is null
            ? NotFound(new { error = "Plik nie jest już dostępny w bibliotece." })
            : Ok(MediaItemResponse.From(result.Item));
    }

    [HttpDelete("{id:guid}", Name = "DeleteMedia")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        if (!IsUserToken())
        {
            return Forbid();
        }

        try
        {
            return await mediaService.DeleteAsync(id, cancellationToken) ? NoContent() : NotFound();
        }
        catch (DbUpdateException exception) when (AppDbContext.IsPlaylistMediaConflict(exception))
        {
            return Conflict(new { error = "Materiał jest używany w playliście. Usuń go z playlist przed usunięciem z biblioteki." });
        }
    }

    [HttpGet("{id:guid}/thumbnail", Name = "GetMediaThumbnail")]
    [Produces("image/jpeg")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetThumbnail(Guid id, CancellationToken cancellationToken)
    {
        if (!IsUserToken()) return Forbid();

        var item = await mediaService.GetAsync(id, cancellationToken);
        if (item is null) return NotFound();

        var thumbnail = await mediaService.OpenThumbnailAsync(item, cancellationToken);
        Response.Headers.CacheControl = "no-store";
        return thumbnail is null ? NotFound() : File(thumbnail, "image/jpeg");
    }

    [HttpGet("{id:guid}/content", Name = "GetMediaContent")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status206PartialContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetContent(Guid id, CancellationToken cancellationToken)
    {
        var tokenType = User.FindFirstValue("token_type");
        if (tokenType is not ("user" or "device"))
        {
            return Forbid();
        }

        var item = await mediaService.GetAsync(id, cancellationToken);
        var stream = item is null ? null : mediaService.OpenContent(item);
        if (item is null || stream is null)
        {
            return NotFound();
        }

        return File(
            stream,
            item.ContentType,
            item.CreatedAt,
            new EntityTagHeaderValue($"\"{item.Sha256}\""),
            enableRangeProcessing: true);
    }

    private bool IsUserToken() => User.FindFirstValue("token_type") == "user";

    private bool TryGetUserId(out Guid userId)
    {
        userId = Guid.Empty;
        return IsUserToken() && Guid.TryParse(User.FindFirstValue("sub"), out userId);
    }
}
