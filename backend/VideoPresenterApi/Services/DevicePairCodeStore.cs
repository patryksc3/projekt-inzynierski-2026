using System.Security.Cryptography;
using Microsoft.Extensions.Options;
using VideoPresenterApi.Configuration;

namespace VideoPresenterApi.Services;

public sealed class DevicePairCodeStore(IOptions<DevicePairingSettings> options) : IDevicePairCodeStore
{
    private sealed record PairCode(Guid DeviceId, DateTimeOffset ExpiresAt);

    private readonly object gate = new();
    private readonly Dictionary<string, PairCode> codes = new(StringComparer.Ordinal);
    private readonly int lifetimeMinutes = Math.Clamp(options.Value.PairCodeLifetimeMinutes, 1, 60 * 24);

    public string Create(Guid deviceId)
    {
        lock (gate)
        {
            RemoveExpiredCodes(DateTimeOffset.UtcNow);

            foreach (var existingCode in codes
                         .Where(entry => entry.Value.DeviceId == deviceId)
                         .Select(entry => entry.Key)
                         .ToArray())
            {
                codes.Remove(existingCode);
            }

            var code = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
                .TrimEnd('=')
                .Replace('+', '-')
                .Replace('/', '_');
            codes[code] = new PairCode(deviceId, DateTimeOffset.UtcNow.AddMinutes(lifetimeMinutes));
            return code;
        }
    }

    public bool TryConsume(string code, out Guid deviceId)
    {
        lock (gate)
        {
            RemoveExpiredCodes(DateTimeOffset.UtcNow);

            if (codes.Remove(code, out var pairCode) && pairCode.ExpiresAt > DateTimeOffset.UtcNow)
            {
                deviceId = pairCode.DeviceId;
                return true;
            }

            deviceId = Guid.Empty;
            return false;
        }
    }

    private void RemoveExpiredCodes(DateTimeOffset now)
    {
        foreach (var expiredCode in codes
                     .Where(entry => entry.Value.ExpiresAt <= now)
                     .Select(entry => entry.Key)
                     .ToArray())
        {
            codes.Remove(expiredCode);
        }
    }
}
