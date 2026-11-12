using System.ComponentModel;
using System.Diagnostics;
using Microsoft.Extensions.Options;
using VideoPresenterApi.Configuration;

namespace VideoPresenterApi.Services;

public sealed class MediaThumbnailGenerator(
    IOptions<MediaStorageSettings> settings, ILogger<MediaThumbnailGenerator> logger)
{
    public async Task<bool> GenerateAsync(
        string inputPath, string outputPath, bool isVideo, CancellationToken cancellationToken)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(10));

        try
        {
            if (isVideo)
            {
                if (await ExtractFrameAsync(inputPath, outputPath, seek: true, timeout.Token))
                    return true;

                File.Delete(outputPath);
            }
            return await ExtractFrameAsync(inputPath, outputPath, seek: false, timeout.Token);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            logger.LogDebug("Przekroczono czas generowania miniatury.");
            return false;
        }
        catch (Win32Exception exception)
        {
            logger.LogWarning(exception, "Nie udało się uruchomić FFmpeg do generowania miniatur.");
            return false;
        }
    }

    private async Task<bool> ExtractFrameAsync(
        string inputPath, string outputPath, bool seek, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var startInfo = new ProcessStartInfo
        {
            FileName = settings.Value.FfmpegPath,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardError = true,
        };
        string[] inputOptions = [
            "-nostdin", "-loglevel", "error", "-y",
            "-protocol_whitelist", "file",
            "-format_whitelist", "image2,bmp_pipe,png_pipe,jpeg_pipe,webp_pipe,mov,matroska,avi",
            "-threads", "1",
        ];
        foreach (var argument in inputOptions) startInfo.ArgumentList.Add(argument);
        if (seek)
        {
            startInfo.ArgumentList.Add("-ss");
            startInfo.ArgumentList.Add("1");
        }

        string[] frameOptions = [
            "-i", inputPath, "-map", "0:V:0", "-frames:v", "1",
            "-filter_threads", "1", "-vf", "scale=320:180:force_original_aspect_ratio=decrease",
            "-c:v", "mjpeg", "-threads", "1", "-q:v", "5", "-f", "image2", "-update", "1", outputPath,
        ];
        foreach (var argument in frameOptions) startInfo.ArgumentList.Add(argument);

        using var process = Process.Start(startInfo);
        if (process is null) return false;

        var drain = process.StandardError.BaseStream.CopyToAsync(Stream.Null);
        try
        {
            await process.WaitForExitAsync(cancellationToken);
        }
        catch (OperationCanceledException)
        {
            if (!process.HasExited)
            {
                try { process.Kill(entireProcessTree: true); }
                catch (InvalidOperationException) { }
            }
            await process.WaitForExitAsync();
            throw;
        }
        finally
        {
            await drain;
        }

        var output = new FileInfo(outputPath);
        return process.ExitCode == 0 && output.Exists && output.Length > 0;
    }
}
