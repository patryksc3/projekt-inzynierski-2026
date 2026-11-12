using System.ComponentModel.DataAnnotations;

namespace VideoPresenterApi.Contracts;

public sealed class CreateDeviceRequest
{
    [Required, StringLength(128, MinimumLength = 1)]
    public string Name { get; init; } = string.Empty;
}
