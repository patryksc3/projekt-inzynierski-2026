using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using VideoPresenterApi.Data;
using VideoPresenterApi.Models;

namespace VideoPresenterApi.Services;

public class UserAuthorizationService(
    AppDbContext dbContext,
    IPasswordHasher<User> passwordHasher) : IUserAuthorizationService
{
    public Task<bool> HasAnyUsersAsync(CancellationToken cancellationToken = default)
    {
        return dbContext.Users.AnyAsync(cancellationToken);
    }

    public async Task<User?> RegisterFirstUserAsync(
        string login,
        string password,
        CancellationToken cancellationToken = default)
    {
        if (await dbContext.Users.AnyAsync(cancellationToken))
        {
            return null;
        }

        var user = new User
        {
            Login = login.Trim()
        };
        user.PasswordHash = passwordHasher.HashPassword(user, password);

        dbContext.Users.Add(user);
        await dbContext.SaveChangesAsync(cancellationToken);

        return user;
    }

    public async Task<User?> AuthenticateAsync(
        string login,
        string password,
        CancellationToken cancellationToken = default)
    {
        var user = await dbContext.Users
            .SingleOrDefaultAsync(candidate => candidate.Login == login.Trim(), cancellationToken);

        if (user is null)
        {
            return null;
        }

        var verificationResult = passwordHasher.VerifyHashedPassword(
            user,
            user.PasswordHash,
            password);

        if (verificationResult == PasswordVerificationResult.Failed)
        {
            return null;
        }

        if (verificationResult == PasswordVerificationResult.SuccessRehashNeeded)
        {
            user.PasswordHash = passwordHasher.HashPassword(user, password);
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        return user;
    }
}
