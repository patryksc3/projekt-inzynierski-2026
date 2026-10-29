using Microsoft.EntityFrameworkCore;
using VideoPresenterApi.Models;

namespace VideoPresenterApi.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Device> Devices => Set<Device>();

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
    }
}
