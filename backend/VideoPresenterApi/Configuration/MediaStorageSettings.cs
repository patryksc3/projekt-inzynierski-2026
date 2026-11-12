namespace VideoPresenterApi.Configuration;

public sealed class MediaStorageSettings
{
    public const string SectionName = "MediaStorage";

    /// <summary>Katalog na pliki; ścieżka względna jest liczona od katalogu zawartości aplikacji.</summary>
    public string RootPath { get; set; } = "media-storage";
    public string FfmpegPath { get; set; } = "ffmpeg";

    public long MaxFileSizeBytes { get; set; } = 500L * 1024 * 1024;
}
