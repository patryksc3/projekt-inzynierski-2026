using Microsoft.EntityFrameworkCore;
using Npgsql;
using VideoPresenterApi.Models;

namespace VideoPresenterApi.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    internal const string PlaylistMediaForeignKey = "FK_PlaylistItems_MediaItems_MediaId";

    public DbSet<User> Users => Set<User>();
    public DbSet<Device> Devices => Set<Device>();
    public DbSet<MediaItem> MediaItems => Set<MediaItem>();
    public DbSet<Playlist> Playlists => Set<Playlist>();
    public DbSet<PlaylistItem> PlaylistItems => Set<PlaylistItem>();

    internal static bool IsPlaylistMediaConflict(DbUpdateException exception) =>
        exception.InnerException is PostgresException
        {
            SqlState: PostgresErrorCodes.ForeignKeyViolation,
            ConstraintName: PlaylistMediaForeignKey
        };

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var user = modelBuilder.Entity<User>();

        user.ToTable("Users");
        user.HasKey(u => u.Id);
        user.Property(u => u.Login)
            .HasMaxLength(128)
            .IsRequired();
        user.HasIndex(u => u.Login)
            .IsUnique();
        user.Property(u => u.PasswordHash)
            .HasMaxLength(512)
            .IsRequired();

        var device = modelBuilder.Entity<Device>();

        device.ToTable("Devices");
        device.HasKey(d => d.Id);
        device.Property(d => d.Name)
            .HasMaxLength(128)
            .IsRequired();
        device.Property(d => d.CredentialHash)
            .HasMaxLength(512)
            .IsRequired();

        var media = modelBuilder.Entity<MediaItem>();

        media.ToTable("MediaItems");
        media.HasKey(m => m.Id);
        media.Property(m => m.OriginalName)
            .HasMaxLength(255)
            .IsRequired();
        media.Property(m => m.ContentType)
            .HasMaxLength(128)
            .IsRequired();
        media.Property(m => m.StorageKey)
            .HasMaxLength(128)
            .IsRequired();
        media.Property(m => m.Sha256)
            .HasMaxLength(64)
            .IsRequired();
        media.Property(m => m.Kind)
            .HasConversion<string>()
            .HasMaxLength(16);
        media.HasIndex(m => m.CreatedAt);
        media.HasOne<User>()
            .WithMany()
            .HasForeignKey(m => m.UploadedByUserId)
            .OnDelete(DeleteBehavior.Restrict);

        var playlist = modelBuilder.Entity<Playlist>();
        playlist.Property(p => p.Name).HasMaxLength(128);
        playlist.Property(p => p.Version).IsConcurrencyToken();
        playlist.HasMany(p => p.Items)
            .WithOne()
            .HasForeignKey(i => i.PlaylistId)
            .OnDelete(DeleteBehavior.Cascade);

        var playlistItem = modelBuilder.Entity<PlaylistItem>();
        playlistItem.HasIndex(i => new { i.PlaylistId, i.Position }).IsUnique();
        playlistItem.HasOne<MediaItem>()
            .WithMany()
            .HasForeignKey(i => i.MediaId)
            .HasConstraintName(PlaylistMediaForeignKey)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
