using VideoPresenterApi.Contracts;
using VideoPresenterApi.Models;

namespace VideoPresenterApi.Services;

public interface IPlaylistsService
{
    Task<List<Playlist>> GetAllAsync(CancellationToken ct);
    Task<Playlist?> GetAsync(Guid id, CancellationToken ct);
    Task<ServiceResult<Playlist>> CreateAsync(PlaylistRequest request, CancellationToken ct);
    Task<ServiceResult<Playlist>> UpdateAsync(Guid id, PlaylistRequest request, CancellationToken ct);
    Task<ServiceResult<bool>> DeleteAsync(Guid id, CancellationToken ct);
}

