using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VideoPresenterApi.Contracts;
using VideoPresenterApi.Data;
using VideoPresenterApi.Models;

namespace VideoPresenterApi.Controllers;

[ApiController]
[Route("api/playlists")]
[Authorize]
public sealed class PlaylistsController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<PlaylistResponse[]>> GetAll(CancellationToken cancellationToken)
    {
        if (!IsUserToken()) return Forbid();

        var playlists = await db.Playlists.AsNoTracking().Include(p => p.Items)
            .OrderBy(p => p.Name).ThenBy(p => p.Id).ToListAsync(cancellationToken);
        return Ok(playlists.Select(PlaylistResponse.From).ToArray());
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<PlaylistResponse>> Get(Guid id, CancellationToken cancellationToken)
    {
        if (!IsUserToken()) return Forbid();

        var playlist = await db.Playlists.AsNoTracking().Include(p => p.Items)
            .SingleOrDefaultAsync(p => p.Id == id, cancellationToken);
        return playlist is null ? NotFound() : Ok(PlaylistResponse.From(playlist));
    }

    [HttpPost]
    public async Task<ActionResult<PlaylistResponse>> Create(
        SavePlaylistRequest request, CancellationToken cancellationToken)
    {
        if (!IsUserToken()) return Forbid();
        var error = await ValidateAsync(request, cancellationToken);
        if (error is not null) return BadRequest(new { error });

        var playlist = new Playlist { Name = request.Name.Trim() };
        playlist.Items.AddRange(CreateItems(playlist.Id, request.Items));
        db.Playlists.Add(playlist);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (AppDbContext.IsPlaylistMediaConflict(exception))
        {
            return MediaChanged();
        }

        return CreatedAtAction(nameof(Get), new { id = playlist.Id }, PlaylistResponse.From(playlist));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<PlaylistResponse>> Update(
        Guid id, SavePlaylistRequest request, CancellationToken cancellationToken)
    {
        if (!IsUserToken()) return Forbid();
        if (request.Version is null || request.Version == Guid.Empty)
            return BadRequest(new { error = "Podaj wersję edytowanej playlisty." });

        var playlist = await db.Playlists.SingleOrDefaultAsync(p => p.Id == id, cancellationToken);
        if (playlist is null) return NotFound();
        if (playlist.Version != request.Version) return PlaylistChanged();

        var error = await ValidateAsync(request, cancellationToken);
        if (error is not null) return BadRequest(new { error });

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        try
        {
            // Update the version before replacing the items so concurrent edits cannot overwrite each other.
            playlist.Name = request.Name.Trim();
            playlist.Version = Guid.NewGuid();
            await db.SaveChangesAsync(cancellationToken);
            await db.PlaylistItems.Where(i => i.PlaylistId == id).ExecuteDeleteAsync(cancellationToken);
            db.PlaylistItems.AddRange(CreateItems(id, request.Items));
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            return PlaylistChanged();
        }
        catch (DbUpdateException exception) when (AppDbContext.IsPlaylistMediaConflict(exception))
        {
            return MediaChanged();
        }

        return Ok(PlaylistResponse.From(playlist));
    }

    private bool IsUserToken() => User.FindFirstValue("token_type") == "user";

    private ConflictObjectResult PlaylistChanged() =>
        Conflict(new { error = "Playlista została zmieniona. Zamknij edytor, odśwież listę i otwórz ją ponownie." });

    private ConflictObjectResult MediaChanged() =>
        Conflict(new { error = "Materiał usunięto z biblioteki. Odśwież dane i wybierz dostępny materiał." });

    private async Task<string?> ValidateAsync(SavePlaylistRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Trim().Length > 128)
            return "Nazwa playlisty musi mieć od 1 do 128 znaków.";

        if (request.Items is null || request.Items.Count is < 1 or > 200)
            return "Playlista musi zawierać od 1 do 200 pozycji.";

        if (request.Items.Any(i => i is null || i.MediaId == Guid.Empty || i.DurationSeconds is < 1 or > 86400))
            return "Każda pozycja musi wskazywać materiał i czas emisji od 1 do 86400 sekund.";

        var mediaIds = request.Items.Select(i => i.MediaId).Distinct().ToArray();
        var count = await db.MediaItems.CountAsync(m => mediaIds.Contains(m.Id), cancellationToken);
        return count == mediaIds.Length ? null : "Co najmniej jednego materiału nie ma w bibliotece.";
    }

    private static IEnumerable<PlaylistItem> CreateItems(Guid playlistId, IReadOnlyList<PlaylistItemInput> items) =>
        items.Select((item, position) => new PlaylistItem
        {
            PlaylistId = playlistId,
            MediaId = item.MediaId,
            Position = position,
            DurationSeconds = item.DurationSeconds
        });
}
