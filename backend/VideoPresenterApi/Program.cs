using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using VideoPresenterApi.Configuration;
using VideoPresenterApi.Data;
using VideoPresenterApi.Models;
using VideoPresenterApi.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();
builder.Services.AddControllers();
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Default")));
builder.Services.AddScoped<IUserAuthorizationService, UserAuthorizationService>();
builder.Services.AddScoped<IPasswordHasher<User>, PasswordHasher<User>>();
builder.Services.AddScoped<IJwtTokenService, JwtTokenService>();

var jwtSettings = builder.Configuration.GetSection(JwtSettings.SectionName).Get<JwtSettings>()
    ?? throw new InvalidOperationException("Brak konfiguracji sekcji Jwt.");
if (string.IsNullOrWhiteSpace(jwtSettings.Issuer) ||
    string.IsNullOrWhiteSpace(jwtSettings.Audience) ||
    string.IsNullOrWhiteSpace(jwtSettings.SigningKey))
{
    throw new InvalidOperationException("Konfiguracja Jwt wymaga Issuer, Audience i SigningKey.");
}

var signingKeyBytes = Convert.FromBase64String(jwtSettings.SigningKey);
if (signingKeyBytes.Length < 32)
{
    throw new InvalidOperationException("Jwt:SigningKey musi zawierać co najmniej 32 bajty.");
}

var signingKey = new SymmetricSecurityKey(signingKeyBytes);
builder.Services.Configure<JwtSettings>(builder.Configuration.GetSection(JwtSettings.SectionName));
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtSettings.Issuer,
            ValidateAudience = true,
            ValidAudience = jwtSettings.Audience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = signingKey,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30)
        };
    });
builder.Services.AddAuthorization();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/openapi/v1.json", "VideoPresenterApi v1");
    });
}

app.UseHttpsRedirection();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
