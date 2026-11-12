using System.ComponentModel.DataAnnotations;

namespace VideoPresenterApi.Contracts;

public sealed class DeviceLoginRequest
{
    [Required]
    public string Password { get; init; } = string.Empty;
}
