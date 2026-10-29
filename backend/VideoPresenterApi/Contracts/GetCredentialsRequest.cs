using System.ComponentModel.DataAnnotations;

namespace VideoPresenterApi.Contracts;

public sealed class GetCredentialsRequest
{
    [Required]
    public string PairCode { get; init; } = string.Empty;
}
