namespace VideoPresenterApi.Configuration;

public sealed class DevicePairingSettings
{
    public const string SectionName = "DevicePairing";

    public int PairCodeLifetimeMinutes { get; set; } = 5;
}
