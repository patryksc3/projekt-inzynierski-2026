using Microsoft.EntityFrameworkCore;
using VideoPresenterApi.Contracts;
using VideoPresenterApi.Data;
using VideoPresenterApi.Models;

namespace VideoPresenterApi.Services;

public sealed class PlaylistsService(AppDbContext db) : IPlaylistsService
{
    public Task<List<Playlist>> GetAllAsync(CancellationToken ct) =>
        db.Playlists.AsNoTracking()
            .Include(p => p.Items).ThenInclude(i => i.MediaItem)
            .OrderBy(p => p.Name).ToListAsync(ct);

    public Task<Playlist?> GetAsync(Guid id, CancellationToken ct) =>
        db.Playlists.AsNoTracking()
            .Include(p => p.Items).ThenInclude(i => i.MediaItem)
            .FirstOrDefaultAsync(p => p.Id == id, ct);

    public async Task<ServiceResult<Playlist>> CreateAsync(PlaylistRequest request, CancellationToken ct)
    {
        var error = await ValidateAsync(request, ct);
        if (error is not null) return new(ServiceStatus.Invalid, Message: error);

        var playlist = new Playlist { Name = request.Name.Trim() };
        playlist.Items = BuildItems(request, playlist.Id);
        db.Playlists.Add(playlist);
        await db.SaveChangesAsync(ct);
        return new(ServiceStatus.Ok, await GetAsync(playlist.Id, ct));
    }

    public async Task<ServiceResult<Playlist>> UpdateAsync(Guid id, PlaylistRequest request, CancellationToken ct)
    {
        var playlist = await db.Playlists.Include(p => p.Items).FirstOrDefaultAsync(p => p.Id == id, ct);
        if (playlist is null) return new(ServiceStatus.NotFound);

        var error = await ValidateAsync(request, ct);
        if (error is not null) return new(ServiceStatus.Invalid, Message: error);

        playlist.Name = request.Name.Trim();
        db.PlaylistItems.RemoveRange(playlist.Items);
        playlist.Items = BuildItems(request, playlist.Id);
        await db.SaveChangesAsync(ct);
        return new(ServiceStatus.Ok, await GetAsync(id, ct));
    }

    public async Task<ServiceResult<bool>> DeleteAsync(Guid id, CancellationToken ct)
    {
        var playlist = await db.Playlists.FirstOrDefaultAsync(p => p.Id == id, ct);
        if (playlist is null) return new(ServiceStatus.NotFound);

        if (await db.Schedules.AnyAsync(s => s.PlaylistId == id, ct))
        {
            return new(ServiceStatus.Conflict, Message: "Playlista jest używana w harmonogramie i nie może zostać usunięta.");
        }

        db.Playlists.Remove(playlist);
        await db.SaveChangesAsync(ct);
        return new(ServiceStatus.Ok, true);
    }

    private static List<PlaylistItem> BuildItems(PlaylistRequest request, Guid playlistId) =>
        request.Items.Select((item, index) => new PlaylistItem
        {
            PlaylistId = playlistId,
            MediaItemId = item.MediaItemId,
            DurationSeconds = item.DurationSeconds,
            Index = index
        }).ToList();

    private async Task<string?> ValidateAsync(PlaylistRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Trim().Length > 128)
            return "Nazwa playlisty jest wymagana (maks. 128 znaków).";
        if (request.Items is null)
            return "Lista elementów jest wymagana.";
        if (request.Items.Any(i => i.DurationSeconds <= 0))
            return "Czas trwania elementu musi być większy od 0 sekund.";

        var ids = request.Items.Select(i => i.MediaItemId).Distinct().ToList();
        var existing = await db.MediaItems.Where(m => ids.Contains(m.Id)).CountAsync(ct);
        return existing != ids.Count ? "Co najmniej jeden z plików multimedialnych nie istnieje." : null;
    }
}

