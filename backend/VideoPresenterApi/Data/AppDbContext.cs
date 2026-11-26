using Microsoft.EntityFrameworkCore;
using VideoPresenterApi.Models;

namespace VideoPresenterApi.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Device> Devices => Set<Device>();
    public DbSet<MediaItem> MediaItems => Set<MediaItem>();
    public DbSet<Playlist> Playlists => Set<Playlist>();
    public DbSet<PlaylistItem> PlaylistItems => Set<PlaylistItem>();
    public DbSet<Schedule> Schedules => Set<Schedule>();
    public DbSet<ScheduleDevice> ScheduleDevices => Set<ScheduleDevice>();

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
        playlist.ToTable("Playlists");
        playlist.HasKey(p => p.Id);
        playlist.Property(p => p.Name).HasMaxLength(128).IsRequired();

        var playlistItem = modelBuilder.Entity<PlaylistItem>();
        playlistItem.ToTable("PlaylistItems");
        playlistItem.HasKey(i => i.Id);
        playlistItem.HasIndex(i => new { i.PlaylistId, i.Index }).IsUnique();
        playlistItem.HasOne(i => i.Playlist).WithMany(p => p.Items)
            .HasForeignKey(i => i.PlaylistId).OnDelete(DeleteBehavior.Cascade);
        playlistItem.HasOne(i => i.MediaItem).WithMany()
            .HasForeignKey(i => i.MediaItemId).OnDelete(DeleteBehavior.Restrict);

        var schedule = modelBuilder.Entity<Schedule>();
        schedule.ToTable("Schedules");
        schedule.HasKey(s => s.Id);
        schedule.Property(s => s.Name).HasMaxLength(128).IsRequired();
        schedule.HasIndex(s => new { s.StartsAt, s.EndsAt });
        schedule.HasOne(s => s.Playlist).WithMany()
            .HasForeignKey(s => s.PlaylistId).OnDelete(DeleteBehavior.Restrict);

        var scheduleDevice = modelBuilder.Entity<ScheduleDevice>();
        scheduleDevice.ToTable("ScheduleDevices");
        scheduleDevice.HasKey(sd => new { sd.ScheduleId, sd.DeviceId });
        scheduleDevice.HasOne(sd => sd.Schedule).WithMany(s => s.Devices)
            .HasForeignKey(sd => sd.ScheduleId).OnDelete(DeleteBehavior.Cascade);
        scheduleDevice.HasOne(sd => sd.Device).WithMany()
            .HasForeignKey(sd => sd.DeviceId).OnDelete(DeleteBehavior.Cascade);
    }
}