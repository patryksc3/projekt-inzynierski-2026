using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using VideoPresenterApi.Configuration;
using VideoPresenterApi.Contracts;
using VideoPresenterApi.Models;

namespace VideoPresenterApi.Services;

public sealed class JwtTokenService(IOptions<JwtSettings> options) : IJwtTokenService
{
    private static readonly TimeSpan TokenLifetime = TimeSpan.FromMinutes(15);
    private readonly JwtSettings settings = options.Value;

    public LoginResponse CreateAccessToken(User user)
    {
        return CreateAccessToken(user.Id, user.Login, "user");
    }

    public LoginResponse CreateAccessToken(Device device)
    {
        return CreateAccessToken(device.Id, device.Name, "device");
    }

    private LoginResponse CreateAccessToken(Guid id, string name, string tokenType)
    {
        var now = DateTimeOffset.UtcNow;
        var expiresAt = now.Add(TokenLifetime);
        var key = new SymmetricSecurityKey(Convert.FromBase64String(settings.SigningKey));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, id.ToString()),
            new Claim(JwtRegisteredClaimNames.UniqueName, name),
            new Claim("token_type", tokenType),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        var token = new JwtSecurityToken(
            issuer: settings.Issuer,
            audience: settings.Audience,
            claims: claims,
            notBefore: now.UtcDateTime,
            expires: expiresAt.UtcDateTime,
            signingCredentials: credentials);

        var accessToken = new JwtSecurityTokenHandler().WriteToken(token);
        return new LoginResponse(accessToken, "Bearer", expiresAt);
    }
}
