using System.ComponentModel.DataAnnotations;

namespace VideoPresenterApi.Contracts;

public sealed record RegisterUserRequest(
    [Required]
    [StringLength(128, MinimumLength = 3)]
    string Login,
    [Required]
    [StringLength(256, MinimumLength = 12)]
    string Password);
