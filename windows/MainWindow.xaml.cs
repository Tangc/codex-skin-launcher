using System;
using System.ComponentModel;
using System.IO;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Microsoft.Win32;
using DrawingColor = System.Drawing.Color;
using Forms = System.Windows.Forms;

namespace CodexSkinLauncher.Windows;

public partial class MainWindow : Window
{
    private const int DebuggingPort = 9333;
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true
    };

    private readonly string _supportDirectory;
    private readonly string _configPath;
    private readonly string _wallpaperPath;
    private readonly CancellationTokenSource _lifetime = new();
    private SkinConfig _config = new();
    private SkinInjector? _injector;
    private bool _loading = true;
    private bool _closing;

    public MainWindow()
    {
        InitializeComponent();
        _supportDirectory = Environment.GetEnvironmentVariable("CODEX_SKIN_SUPPORT_DIRECTORY")
            ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Codex Skin Launcher");
        _configPath = Path.Combine(_supportDirectory, "config.json");
        _wallpaperPath = Path.Combine(_supportDirectory, "wallpaper.jpg");
        Directory.CreateDirectory(_supportDirectory);
        LoadConfig();
        ApplyConfigToControls();
        _loading = false;
        RefreshPreview();
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        _injector = new SkinInjector(DebuggingPort, _config, UpdateStatus);
        _injector.Start();

        if (Environment.GetEnvironmentVariable("CODEX_SKIN_NO_AUTOSTART") == "1")
        {
            UpdateStatus("waiting", "测试模式：未自动启动 Codex");
            return;
        }

        await RestartCodexAsync();
    }

    private async void Window_Closing(object? sender, CancelEventArgs e)
    {
        if (_closing) return;
        _closing = true;
        _lifetime.Cancel();
        if (_injector is not null) await _injector.DisposeAsync();
        _lifetime.Dispose();
    }

    private void LoadConfig()
    {
        try
        {
            if (File.Exists(_configPath))
            {
                _config = JsonSerializer.Deserialize<SkinConfig>(File.ReadAllText(_configPath), JsonOptions) ?? new SkinConfig();
            }
        }
        catch
        {
            _config = new SkinConfig();
        }

        if (File.Exists(_wallpaperPath)) _config.BackgroundImagePath = _wallpaperPath;
    }

    private void ApplyConfigToControls()
    {
        EnabledCheckBox.IsChecked = _config.Enabled;
        OverlaySlider.Value = _config.OverlayOpacity;
        PanelSlider.Value = _config.PanelOpacity;
        BlurSlider.Value = _config.BlurRadius;
        BrightnessSlider.Value = _config.Brightness;
        SaturationSlider.Value = _config.Saturation;
        UiFontTextBox.Text = _config.UiFontFamily;
        CodeFontTextBox.Text = _config.CodeFontFamily;
        ImageFitComboBox.SelectedIndex = _config.ImageFit == "contain" ? 1 : 0;
        LayoutThemeComboBox.SelectedIndex = _config.LayoutTheme switch
        {
            "wechat" => 1,
            "feishu" => 2,
            "qq2007" => 3,
            _ => 0
        };
        UpdateColorButton(BackgroundColorButton, _config.BackgroundColor);
        UpdateColorButton(ForegroundColorButton, _config.ForegroundColor);
        UpdateColorButton(AccentColorButton, _config.AccentColor);
        WallpaperNameText.Text = _config.HasWallpaper ? "wallpaper.jpg" : "未选择背景图";
        RefreshValueLabels();
    }

    private void SettingsChanged(object sender, RoutedEventArgs e)
    {
        if (_loading || !IsLoaded) return;
        ReadControlsIntoConfig();
        PersistAndApply();
    }

    private void ReadControlsIntoConfig()
    {
        _config.Enabled = EnabledCheckBox.IsChecked == true;
        _config.OverlayOpacity = OverlaySlider.Value;
        _config.PanelOpacity = PanelSlider.Value;
        _config.BlurRadius = BlurSlider.Value;
        _config.Brightness = BrightnessSlider.Value;
        _config.Saturation = SaturationSlider.Value;
        _config.ImageFit = (ImageFitComboBox.SelectedItem as ComboBoxItem)?.Tag?.ToString() == "contain" ? "contain" : "cover";
        _config.LayoutTheme = (LayoutThemeComboBox.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? "original";
        _config.UiFontFamily = UiFontTextBox.Text.Trim();
        _config.CodeFontFamily = CodeFontTextBox.Text.Trim();
        _config.BackgroundColor = BackgroundColorButton.Tag?.ToString() ?? "#0D1117";
        _config.ForegroundColor = ForegroundColorButton.Tag?.ToString() ?? "#E8EDF5";
        _config.AccentColor = AccentColorButton.Tag?.ToString() ?? "#7C9CFF";
    }

    private void PersistAndApply()
    {
        try
        {
            Directory.CreateDirectory(_supportDirectory);
            File.WriteAllText(_configPath, JsonSerializer.Serialize(_config, JsonOptions));
            _injector?.UpdateConfig(_config);
            RefreshValueLabels();
            RefreshPreview();
        }
        catch (Exception error)
        {
            UpdateStatus("error", $"配置保存失败：{error.Message}");
        }
    }

    private void ChooseImage_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new OpenFileDialog
        {
            Title = "选择 Codex 背景图片",
            Filter = "图片文件|*.jpg;*.jpeg;*.png;*.bmp;*.tif;*.tiff|所有文件|*.*"
        };
        if (dialog.ShowDialog(this) != true) return;

        try
        {
            SaveCompressedWallpaper(dialog.FileName, _wallpaperPath);
            _config.BackgroundImagePath = _wallpaperPath;
            WallpaperNameText.Text = Path.GetFileName(dialog.FileName);
            PersistAndApply();
        }
        catch (Exception error)
        {
            MessageBox.Show(this, $"背景图读取失败：{error.Message}", "Codex 换肤启动器", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private void RemoveImage_Click(object sender, RoutedEventArgs e)
    {
        try { if (File.Exists(_wallpaperPath)) File.Delete(_wallpaperPath); } catch { }
        _config.BackgroundImagePath = "";
        WallpaperNameText.Text = "未选择背景图";
        PersistAndApply();
    }

    private void ChooseColor_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not System.Windows.Controls.Button button) return;
        var current = button switch
        {
            _ when ReferenceEquals(button, BackgroundColorButton) => _config.BackgroundColor,
            _ when ReferenceEquals(button, ForegroundColorButton) => _config.ForegroundColor,
            _ when ReferenceEquals(button, AccentColorButton) => _config.AccentColor,
            _ => "#0D1117"
        };

        using var dialog = new Forms.ColorDialog
        {
            FullOpen = true,
            Color = DrawingColorTranslator(current)
        };
        if (dialog.ShowDialog() != Forms.DialogResult.OK) return;

        var hex = $"#{dialog.Color.R:X2}{dialog.Color.G:X2}{dialog.Color.B:X2}";
        if (ReferenceEquals(button, BackgroundColorButton))
        {
            _config.BackgroundColor = hex;
        }
        else if (ReferenceEquals(button, ForegroundColorButton))
        {
            _config.ForegroundColor = hex;
        }
        else if (ReferenceEquals(button, AccentColorButton))
        {
            _config.AccentColor = hex;
        }
        UpdateColorButton(button, hex);
        PersistAndApply();
    }

    private async void RestartCodex_Click(object sender, RoutedEventArgs e) => await RestartCodexAsync();

    private async Task RestartCodexAsync()
    {
        UpdateStatus("waiting", "正在定位并启动 Codex…");
        try
        {
            var executable = await CodexProcessService.RestartAsync(DebuggingPort, _lifetime.Token);
            UpdateStatus("waiting", $"Codex 已启动，正在连接…（{Path.GetFileName(executable)}）");
        }
        catch (OperationCanceledException) when (_lifetime.IsCancellationRequested)
        {
        }
        catch (Exception error)
        {
            UpdateStatus("error", error.Message);
            MessageBox.Show(this, error.Message, "Codex 换肤启动器", MessageBoxButton.OK, MessageBoxImage.Warning);
        }
    }

    private void Reset_Click(object sender, RoutedEventArgs e)
    {
        _config = new SkinConfig { BackgroundImagePath = File.Exists(_wallpaperPath) ? _wallpaperPath : "" };
        _loading = true;
        ApplyConfigToControls();
        _loading = false;
        PersistAndApply();
    }

    private void RefreshValueLabels()
    {
        OverlayValueText.Text = $"{Math.Round(OverlaySlider.Value * 100)}%";
        PanelValueText.Text = $"{Math.Round(PanelSlider.Value * 100)}%";
        BlurValueText.Text = $"{Math.Round(BlurSlider.Value)} px";
        BrightnessValueText.Text = $"{Math.Round(BrightnessSlider.Value * 100)}%";
        SaturationValueText.Text = $"{Math.Round(SaturationSlider.Value * 100)}%";
    }

    private void RefreshPreview()
    {
        var background = BrushFromHex(_config.BackgroundColor, "#0D1117");
        var foreground = BrushFromHex(_config.ForegroundColor, "#E8EDF5");
        var accent = BrushFromHex(_config.AccentColor, "#7C9CFF");
        PreviewBorder.Background = background;
        PreviewAccent.Background = accent;
        PreviewThemeName.Text = _config.LayoutTheme switch
        {
            "wechat" => "微信式工作台",
            "feishu" => "飞书式工作台",
            "qq2007" => "QQ 2007 复古工作台",
            _ => "原始布局"
        };
        Foreground = foreground;

        var panelColor = ((SolidColorBrush)background).Color;
        var panelAlpha = (byte)Math.Round(Math.Clamp(_config.PanelOpacity, 0, 1) * 255);
        var underAlpha = (byte)Math.Round(Math.Clamp(_config.PanelOpacity - 0.2, 0.22, 1) * 255);
        PreviewPanel.Background = new SolidColorBrush(Color.FromArgb(panelAlpha, panelColor.R, panelColor.G, panelColor.B));
        PreviewSidebar.Background = new SolidColorBrush(Color.FromArgb(underAlpha, panelColor.R, panelColor.G, panelColor.B));
        PreviewOverlay.Background = new SolidColorBrush(Color.FromArgb(
            (byte)Math.Round(Math.Clamp(_config.OverlayOpacity, 0, 1) * 255),
            panelColor.R,
            panelColor.G,
            panelColor.B
        ));

        if (_config.HasWallpaper)
        {
            var image = new BitmapImage();
            image.BeginInit();
            image.CacheOption = BitmapCacheOption.OnLoad;
            image.UriSource = new Uri(_config.BackgroundImagePath, UriKind.Absolute);
            image.EndInit();
            image.Freeze();
            PreviewWallpaper.Background = new ImageBrush(image)
            {
                Stretch = _config.ImageFit == "contain" ? Stretch.Uniform : Stretch.UniformToFill,
                AlignmentX = AlignmentX.Center,
                AlignmentY = AlignmentY.Center
            };
        }
        else
        {
            PreviewWallpaper.Background = background;
        }
    }

    private void UpdateStatus(string state, string message)
    {
        if (!Dispatcher.CheckAccess())
        {
            Dispatcher.BeginInvoke(() => UpdateStatus(state, message));
            return;
        }

        StatusText.Text = message;
        StatusDot.Fill = state switch
        {
            "connected" => new SolidColorBrush(Color.FromRgb(70, 201, 126)),
            "error" => new SolidColorBrush(Color.FromRgb(235, 91, 91)),
            _ => new SolidColorBrush(Color.FromRgb(229, 168, 75))
        };
    }

    private static void SaveCompressedWallpaper(string sourcePath, string destinationPath)
    {
        using var input = File.OpenRead(sourcePath);
        var decoder = BitmapDecoder.Create(input, BitmapCreateOptions.PreservePixelFormat, BitmapCacheOption.OnLoad);
        var frame = decoder.Frames[0];
        BitmapSource output = frame;
        const double maxDimension = 3000;
        if (Math.Max(frame.PixelWidth, frame.PixelHeight) > maxDimension)
        {
            var scale = maxDimension / Math.Max(frame.PixelWidth, frame.PixelHeight);
            output = new TransformedBitmap(frame, new ScaleTransform(scale, scale));
        }

        var encoder = new JpegBitmapEncoder { QualityLevel = 88 };
        encoder.Frames.Add(BitmapFrame.Create(output));
        Directory.CreateDirectory(Path.GetDirectoryName(destinationPath)!);
        using var outputStream = File.Create(destinationPath);
        encoder.Save(outputStream);
    }

    private static void UpdateColorButton(System.Windows.Controls.Button button, string hex)
    {
        button.Tag = hex;
        button.Background = BrushFromHex(hex, "#0D1117");
        button.Content = hex.ToUpperInvariant();
        var color = ((SolidColorBrush)button.Background).Color;
        var luminance = (0.299 * color.R + 0.587 * color.G + 0.114 * color.B) / 255;
        button.Foreground = luminance > 0.58 ? Brushes.Black : Brushes.White;
    }

    private static SolidColorBrush BrushFromHex(string? hex, string fallback)
    {
        try { return new SolidColorBrush((Color)ColorConverter.ConvertFromString(hex ?? fallback)); }
        catch { return new SolidColorBrush((Color)ColorConverter.ConvertFromString(fallback)); }
    }

    private static DrawingColor DrawingColorTranslator(string hex)
    {
        try { return System.Drawing.ColorTranslator.FromHtml(hex); }
        catch { return DrawingColor.FromArgb(13, 17, 23); }
    }
}
