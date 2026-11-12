using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using VideoPresenterApi.Contracts;
using VideoPresenterApi.Data;
using VideoPresenterApi.Models;

namespace VideoPresenterApi.Controllers;

[ApiController]
[Route("api/schedule")]
[Authorize]
public sealed class ScheduleController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ScheduleBlockResponse[]>> GetAll(CancellationToken cancellationToken)
    {
        if (!IsUserToken()) return Forbid();

        var blocks = db.ScheduleBlocks.OrderBy(b => b.StartsAt).ThenBy(b => b.Id);
        return Ok(await Responses(blocks).ToArrayAsync(cancellationToken));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ScheduleBlockResponse>> Get(Guid id, CancellationToken cancellationToken)
    {
        if (!IsUserToken()) return Forbid();

        var block = await Responses(db.ScheduleBlocks.Where(b => b.Id == id))
            .SingleOrDefaultAsync(cancellationToken);
        return block is null ? NotFound() : Ok(block);
    }

    [HttpPost]
    public Task<ActionResult<ScheduleBlockResponse>> Create(
        SaveScheduleBlockRequest request, CancellationToken cancellationToken) =>
        SaveAsync(null, request, cancellationToken);

    [HttpPut("{id:guid}")]
    public Task<ActionResult<ScheduleBlockResponse>> Update(
        Guid id, SaveScheduleBlockRequest request, CancellationToken cancellationToken) =>
        SaveAsync(id, request, cancellationToken);

    private async Task<ActionResult<ScheduleBlockResponse>> SaveAsync(
        Guid? id, SaveScheduleBlockRequest request, CancellationToken cancellationToken)
    {
        if (!IsUserToken()) return Forbid();
        if (request.StartsAt is not { } startsAt || request.EndsAt is not { } endsAt || startsAt >= endsAt)
            return BadRequest(new { error = "Koniec emisji musi przypadać po jej rozpoczęciu." });

        if (id.HasValue && (request.Version is null || request.Version == Guid.Empty))
            return BadRequest(new { error = "Podaj wersję edytowanego bloku." });

        startsAt = startsAt.ToUniversalTime();
        endsAt = endsAt.ToUniversalTime();

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        // Serialize overlap checks and writes for this screen until the transaction commits.
        var devices = await db.Database.SqlQuery<string>(
            $"""SELECT "Name" FROM "Devices" WHERE "Id" = {request.DeviceId} FOR NO KEY UPDATE""")
            .ToListAsync(cancellationToken);
        if (devices.Count == 0)
            return BadRequest(new { error = "Wybrany ekran nie istnieje." });

        var playlistName = await db.Playlists
            .Where(p => p.Id == request.PlaylistId).Select(p => p.Name)
            .SingleOrDefaultAsync(cancellationToken);
        if (playlistName is null)
            return BadRequest(new { error = "Wybrana playlista nie istnieje." });

        var block = new ScheduleBlock();
        if (id is { } blockId)
        {
            var existing = await db.ScheduleBlocks.SingleOrDefaultAsync(b => b.Id == blockId, cancellationToken);
            if (existing is null) return NotFound();
            if (existing.Version != request.Version) return BlockChanged();
            block = existing;
        }

        var overlaps = await db.ScheduleBlocks.AnyAsync(b =>
            b.DeviceId == request.DeviceId && b.Id != block.Id &&
            b.StartsAt < endsAt && startsAt < b.EndsAt, cancellationToken);
        if (overlaps)
            return Conflict(new { error = "W tym czasie na wybranym ekranie jest już zaplanowana emisja." });

        block.DeviceId = request.DeviceId;
        block.PlaylistId = request.PlaylistId;
        block.StartsAt = startsAt;
        block.EndsAt = endsAt;
        if (id.HasValue)
            block.Version = Guid.NewGuid();
        else
            db.ScheduleBlocks.Add(block);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            return BlockChanged();
        }
        catch (DbUpdateException exception) when (
            exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.ForeignKeyViolation })
        {
            return Conflict(new { error = "Wybrany ekran lub playlista są już niedostępne." });
        }

        var response = new ScheduleBlockResponse(
            block.Id, block.DeviceId, devices[0], block.PlaylistId, playlistName,
            block.StartsAt, block.EndsAt, block.Version);
        return id.HasValue ? Ok(response) : CreatedAtAction(nameof(Get), new { id = block.Id }, response);
    }

    private static IQueryable<ScheduleBlockResponse> Responses(IQueryable<ScheduleBlock> blocks) =>
        blocks.Select(b => new ScheduleBlockResponse(
            b.Id, b.DeviceId, b.Device.Name, b.PlaylistId, b.Playlist.Name,
            b.StartsAt, b.EndsAt, b.Version));

    private bool IsUserToken() => User.FindFirstValue("token_type") == "user";

    private ConflictObjectResult BlockChanged() =>
        Conflict(new { error = "Blok został zmieniony. Zamknij edytor, odśwież listę i otwórz go ponownie." });
}
