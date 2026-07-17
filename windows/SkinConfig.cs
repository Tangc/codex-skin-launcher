using System.IO;
using System.Text.Json.Serialization;

namespace CodexSkinLauncher.Windows;

public sealed class SkinConfig
{
    public bool Enabled { get; set; } = true;
    public string LayoutTheme { get; set; } = "original";
    public string BackgroundImagePath { get; set; } = "";
    public string BackgroundColor { get; set; } = "#0D1117";
    public string ForegroundColor { get; set; } = "#E8EDF5";
    public string AccentColor { get; set; } = "#7C9CFF";
    public double OverlayOpacity { get; set; } = 0.58;
    public double PanelOpacity { get; set; } = 0.78;
    public double BlurRadius { get; set; } = 3;
    public double Brightness { get; set; } = 0.86;
    public double Saturation { get; set; } = 0.92;
    public string ImageFit { get; set; } = "cover";
    public string UiFontFamily { get; set; } = "";
    public string CodeFontFamily { get; set; } = "";

    [JsonIgnore]
    public bool HasWallpaper => !string.IsNullOrWhiteSpace(BackgroundImagePath) && File.Exists(BackgroundImagePath);

    public SkinConfig Copy() => (SkinConfig)MemberwiseClone();
}
