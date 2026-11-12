using System.Security.Cryptography;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using VideoPresenterApi.Contracts;
using VideoPresenterApi.Data;
using VideoPresenterApi.Models;

namespace VideoPresenterApi.Services;

public sealed class DevicesService(
    AppDbContext dbContext,
    IDevicePairCodeStore pairCodeStore,
    IPasswordHasher<Device> passwordHasher) : IDevicesService
{
    public async Task<IReadOnlyList<DeviceSummary>> GetAllAsync(
        CancellationToken cancellationToken = default)
    {
        return await dbContext.Devices
            .AsNoTracking()
            .OrderBy(device => device.Name)
            .Select(device => new DeviceSummary(device.Id, device.Name))
            .ToListAsync(cancellationToken);
    }

    public async Task<Device> CreateAsync(
        string name,
        CancellationToken cancellationToken = default)
    {
        var device = new Device
        {
            Name = name.Trim(),
            CredentialHash = string.Empty
        };

        dbContext.Devices.Add(device);
        await dbContext.SaveChangesAsync(cancellationToken);
        return device;
    }

    public async Task<string?> CreatePairCodeAsync(
        Guid deviceId,
        CancellationToken cancellationToken = default)
    {
        var deviceExists = await dbContext.Devices
            .AnyAsync(device => device.Id == deviceId, cancellationToken);
        return deviceExists ? pairCodeStore.Create(deviceId) : null;
    }

    public async Task<string?> CreateCredentialsAsync(
        string pairCode,
        CancellationToken cancellationToken = default)
    {
        if (!pairCodeStore.TryConsume(pairCode, out var deviceId))
        {
            return null;
        }

        var device = await dbContext.Devices
            .SingleOrDefaultAsync(candidate => candidate.Id == deviceId, cancellationToken);
        if (device is null)
        {
            return null;
        }

        var secret = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
        var password = $"{device.Id:N}.{secret}";
        device.CredentialHash = passwordHasher.HashPassword(device, password);
        await dbContext.SaveChangesAsync(cancellationToken);

        return password;
    }

    public async Task<Device?> AuthenticateAsync(
        string password,
        CancellationToken cancellationToken = default)
    {
        var separatorIndex = password.IndexOf('.');
        if (separatorIndex != 32 ||
            !Guid.TryParseExact(password[..separatorIndex], "N", out var deviceId))
        {
            return null;
        }

        var device = await dbContext.Devices
            .SingleOrDefaultAsync(candidate => candidate.Id == deviceId, cancellationToken);
        if (device is null || string.IsNullOrWhiteSpace(device.CredentialHash))
        {
            return null;
        }

        var result = passwordHasher.VerifyHashedPassword(device, device.CredentialHash, password);
        if (result == PasswordVerificationResult.Failed)
        {
            return null;
        }

        if (result == PasswordVerificationResult.SuccessRehashNeeded)
        {
            device.CredentialHash = passwordHasher.HashPassword(device, password);
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        return device;
    }
}
