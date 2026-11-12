using System.ComponentModel.DataAnnotations;

namespace VideoPresenterApi.Contracts;

public sealed record LoginRequest(
    [Required]
    [StringLength(128, MinimumLength = 3)]
    string Login,
    [Required]
    [StringLength(256, MinimumLength = 1)]
    string Password);
