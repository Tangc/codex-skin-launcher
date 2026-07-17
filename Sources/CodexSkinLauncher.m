#import <Cocoa/Cocoa.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

static NSString *const CodexBundleIdentifier = @"com.openai.codex";
static NSInteger const DebuggingPort = 9333;

@interface AppDelegate : NSObject <NSApplicationDelegate, NSTextFieldDelegate>
@property(nonatomic, strong) NSWindow *window;
@property(nonatomic, strong) NSTextField *statusLabel;
@property(nonatomic, strong) NSImageView *imagePreview;
@property(nonatomic, strong) NSColorWell *backgroundColorWell;
@property(nonatomic, strong) NSColorWell *foregroundColorWell;
@property(nonatomic, strong) NSColorWell *accentColorWell;
@property(nonatomic, strong) NSSlider *overlaySlider;
@property(nonatomic, strong) NSSlider *panelSlider;
@property(nonatomic, strong) NSSlider *blurSlider;
@property(nonatomic, strong) NSSlider *brightnessSlider;
@property(nonatomic, strong) NSSlider *saturationSlider;
@property(nonatomic, strong) NSTextField *overlayValue;
@property(nonatomic, strong) NSTextField *panelValue;
@property(nonatomic, strong) NSTextField *blurValue;
@property(nonatomic, strong) NSTextField *brightnessValue;
@property(nonatomic, strong) NSTextField *saturationValue;
@property(nonatomic, strong) NSPopUpButton *fitPicker;
@property(nonatomic, strong) NSPopUpButton *layoutPicker;
@property(nonatomic, strong) NSTextField *uiFontField;
@property(nonatomic, strong) NSTextField *codeFontField;
@property(nonatomic, strong) NSButton *enabledSwitch;
@property(nonatomic, strong) NSButton *restartButton;
@property(nonatomic, strong) NSTask *injectorTask;
@property(nonatomic, strong) NSTimer *statusTimer;
@property(nonatomic, copy) NSString *selectedImagePath;
@property(nonatomic, copy) NSString *backgroundImagePath;
@property(nonatomic, copy) NSString *supportDirectory;
@property(nonatomic, copy) NSString *configPath;
@property(nonatomic, copy) NSString *statusPath;
@property(nonatomic, copy) NSString *wallpaperPath;
@end

@implementation AppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
    [self preparePaths];
    [self buildWindow];
    [self loadSettings];
    [self saveSettings];
    [self.window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];

    self.statusTimer = [NSTimer scheduledTimerWithTimeInterval:1.0
                                                       target:self
                                                     selector:@selector(refreshStatus)
                                                     userInfo:nil
                                                      repeats:YES];
    if (![NSProcessInfo.processInfo.environment[@"CODEX_SKIN_NO_AUTOSTART"] isEqualToString:@"1"]) {
        [self restartCodex:nil];
    } else {
        [self setStatus:@"测试模式：已跳过自动启动" state:@"waiting"];
    }
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
    return NO;
}

- (void)applicationWillTerminate:(NSNotification *)notification {
    [self.statusTimer invalidate];
    [self stopInjector];
}

- (void)preparePaths {
    NSString *overrideDirectory = NSProcessInfo.processInfo.environment[@"CODEX_SKIN_SUPPORT_DIRECTORY"];
    if (overrideDirectory.length > 0) {
        self.supportDirectory = overrideDirectory;
    } else {
        NSString *base = NSSearchPathForDirectoriesInDomains(NSApplicationSupportDirectory, NSUserDomainMask, YES).firstObject;
        self.supportDirectory = [base stringByAppendingPathComponent:@"Codex Skin Launcher"];
    }
    self.configPath = [self.supportDirectory stringByAppendingPathComponent:@"config.json"];
    self.statusPath = [self.supportDirectory stringByAppendingPathComponent:@"status.json"];
    self.wallpaperPath = [self.supportDirectory stringByAppendingPathComponent:@"wallpaper.jpg"];
    [[NSFileManager defaultManager] createDirectoryAtPath:self.supportDirectory
                              withIntermediateDirectories:YES
                                               attributes:nil
                                                    error:nil];
}

- (NSTextField *)label:(NSString *)text frame:(NSRect)frame size:(CGFloat)size weight:(NSFontWeight)weight {
    NSTextField *label = [[NSTextField alloc] initWithFrame:frame];
    label.stringValue = text;
    label.editable = NO;
    label.selectable = NO;
    label.bezeled = NO;
    label.drawsBackground = NO;
    label.textColor = [NSColor colorWithWhite:0.93 alpha:1.0];
    label.font = [NSFont systemFontOfSize:size weight:weight];
    return label;
}

- (NSBox *)panel:(NSString *)title frame:(NSRect)frame {
    NSBox *box = [[NSBox alloc] initWithFrame:frame];
    box.boxType = NSBoxCustom;
    box.title = title;
    box.titlePosition = NSAtTop;
    box.titleFont = [NSFont systemFontOfSize:14 weight:NSFontWeightSemibold];
    [(NSTextFieldCell *)box.titleCell setTextColor:[NSColor colorWithWhite:0.94 alpha:1.0]];
    box.fillColor = [NSColor colorWithRed:0.10 green:0.13 blue:0.20 alpha:0.96];
    box.borderColor = [NSColor colorWithWhite:1 alpha:0.10];
    box.borderWidth = 1;
    box.cornerRadius = 13;
    box.contentViewMargins = NSMakeSize(14, 14);
    return box;
}

- (NSButton *)button:(NSString *)title frame:(NSRect)frame action:(SEL)action primary:(BOOL)primary {
    NSButton *button = [[NSButton alloc] initWithFrame:frame];
    button.title = title;
    button.target = self;
    button.action = action;
    button.bezelStyle = primary ? NSBezelStyleTexturedRounded : NSBezelStyleRounded;
    button.font = [NSFont systemFontOfSize:13 weight:primary ? NSFontWeightSemibold : NSFontWeightRegular];
    return button;
}

- (void)buildWindow {
    NSRect frame = NSMakeRect(0, 0, 760, 790);
    self.window = [[NSWindow alloc] initWithContentRect:frame
                                             styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable
                                               backing:NSBackingStoreBuffered
                                                 defer:NO];
    self.window.title = @"Codex 皮肤与布局启动器";
    self.window.minSize = NSMakeSize(760, 790);
    self.window.maxSize = NSMakeSize(760, 790);
    [self.window center];

    NSView *root = self.window.contentView;
    root.wantsLayer = YES;
    root.layer.backgroundColor = [NSColor colorWithRed:0.035 green:0.055 blue:0.10 alpha:1].CGColor;

    NSTextField *title = [self label:@"Codex 皮肤与布局启动器" frame:NSMakeRect(28, 730, 380, 34) size:25 weight:NSFontWeightBold];
    [root addSubview:title];
    NSTextField *subtitle = [self label:@"打开后自动启动 Codex；皮肤与工作台布局实时应用" frame:NSMakeRect(29, 708, 460, 20) size:13 weight:NSFontWeightRegular];
    subtitle.textColor = [NSColor colorWithWhite:0.65 alpha:1];
    [root addSubview:subtitle];
    self.statusLabel = [self label:@"准备启动" frame:NSMakeRect(470, 722, 260, 38) size:12 weight:NSFontWeightMedium];
    self.statusLabel.alignment = NSTextAlignmentRight;
    self.statusLabel.maximumNumberOfLines = 2;
    [root addSubview:self.statusLabel];

    NSBox *imagePanel = [self panel:@"背景图片" frame:NSMakeRect(24, 528, 712, 166)];
    [root addSubview:imagePanel];
    NSView *imageContent = imagePanel.contentView;
    self.imagePreview = [[NSImageView alloc] initWithFrame:NSMakeRect(10, 9, 220, 114)];
    self.imagePreview.imageScaling = NSImageScaleAxesIndependently;
    self.imagePreview.wantsLayer = YES;
    self.imagePreview.layer.cornerRadius = 10;
    self.imagePreview.layer.masksToBounds = YES;
    self.imagePreview.layer.backgroundColor = [NSColor colorWithRed:0.05 green:0.07 blue:0.10 alpha:1].CGColor;
    [imageContent addSubview:self.imagePreview];

    [imageContent addSubview:[self button:@"选择图片" frame:NSMakeRect(252, 83, 105, 32) action:@selector(chooseWallpaper:) primary:YES]];
    [imageContent addSubview:[self button:@"移除" frame:NSMakeRect(365, 83, 82, 32) action:@selector(clearWallpaper:) primary:NO]];
    NSTextField *fitLabel = [self label:@"显示方式" frame:NSMakeRect(254, 47, 70, 20) size:13 weight:NSFontWeightRegular];
    [imageContent addSubview:fitLabel];
    self.fitPicker = [[NSPopUpButton alloc] initWithFrame:NSMakeRect(325, 43, 145, 27) pullsDown:NO];
    [self.fitPicker addItemsWithTitles:@[@"铺满", @"完整显示"]];
    self.fitPicker.target = self;
    self.fitPicker.action = @selector(settingsChanged:);
    [imageContent addSubview:self.fitPicker];
    NSTextField *imageHint = [self label:@"支持 JPG、PNG、HEIC、WebP 等图片；会自动优化尺寸" frame:NSMakeRect(254, 14, 390, 20) size:12 weight:NSFontWeightRegular];
    imageHint.textColor = [NSColor colorWithWhite:0.58 alpha:1];
    [imageContent addSubview:imageHint];

    NSBox *colorPanel = [self panel:@"颜色" frame:NSMakeRect(24, 437, 712, 78)];
    [root addSubview:colorPanel];
    NSView *colorContent = colorPanel.contentView;
    NSArray<NSString *> *colorTitles = @[@"背景基色", @"文字颜色", @"强调颜色"];
    for (NSInteger index = 0; index < 3; index++) {
        CGFloat x = 20 + index * 220;
        [colorContent addSubview:[self label:colorTitles[index] frame:NSMakeRect(x, 11, 76, 24) size:13 weight:NSFontWeightRegular]];
        NSColorWell *well = [[NSColorWell alloc] initWithFrame:NSMakeRect(x + 82, 10, 74, 27)];
        well.target = self;
        well.action = @selector(settingsChanged:);
        [colorContent addSubview:well];
        if (index == 0) self.backgroundColorWell = well;
        if (index == 1) self.foregroundColorWell = well;
        if (index == 2) self.accentColorWell = well;
    }

    NSBox *layoutPanel = [self panel:@"Codex 工作台布局" frame:NSMakeRect(24, 367, 712, 58)];
    [root addSubview:layoutPanel];
    NSView *layoutContent = layoutPanel.contentView;
    self.layoutPicker = [[NSPopUpButton alloc] initWithFrame:NSMakeRect(12, 2, 250, 28) pullsDown:NO];
    [self.layoutPicker addItemsWithTitles:@[@"原始布局", @"微信式工作台", @"飞书式工作台", @"QQ 2007 复古工作台"]];
    self.layoutPicker.target = self;
    self.layoutPicker.action = @selector(settingsChanged:);
    [layoutContent addSubview:self.layoutPicker];
    NSTextField *layoutHint = [self label:@"改变 Codex 内部的工具栏、任务区和信息栏结构" frame:NSMakeRect(280, 6, 390, 20) size:12 weight:NSFontWeightRegular];
    layoutHint.textColor = [NSColor colorWithWhite:0.58 alpha:1];
    [layoutContent addSubview:layoutHint];

    NSBox *effectPanel = [self panel:@"图片与面板效果" frame:NSMakeRect(24, 173, 712, 181)];
    [root addSubview:effectPanel];
    NSView *effectContent = effectPanel.contentView;
    self.overlaySlider = [self addSlider:@"遮罩" row:4 min:0 max:0.9 toView:effectContent valueLabel:&_overlayValue];
    self.panelSlider = [self addSlider:@"面板透明度" row:3 min:0.35 max:0.98 toView:effectContent valueLabel:&_panelValue];
    self.blurSlider = [self addSlider:@"背景模糊" row:2 min:0 max:16 toView:effectContent valueLabel:&_blurValue];
    self.brightnessSlider = [self addSlider:@"背景亮度" row:1 min:0.4 max:1.25 toView:effectContent valueLabel:&_brightnessValue];
    self.saturationSlider = [self addSlider:@"背景饱和度" row:0 min:0 max:1.5 toView:effectContent valueLabel:&_saturationValue];

    NSBox *fontPanel = [self panel:@"字体（留空则使用 Codex 设置）" frame:NSMakeRect(24, 95, 712, 66)];
    [root addSubview:fontPanel];
    NSView *fontContent = fontPanel.contentView;
    self.uiFontField = [[NSTextField alloc] initWithFrame:NSMakeRect(12, 6, 320, 27)];
    self.uiFontField.placeholderString = @"UI 字体，例如：PingFang SC";
    self.uiFontField.delegate = self;
    [fontContent addSubview:self.uiFontField];
    self.codeFontField = [[NSTextField alloc] initWithFrame:NSMakeRect(346, 6, 320, 27)];
    self.codeFontField.placeholderString = @"代码字体，例如：JetBrains Mono";
    self.codeFontField.delegate = self;
    [fontContent addSubview:self.codeFontField];

    self.enabledSwitch = [[NSButton alloc] initWithFrame:NSMakeRect(29, 51, 120, 28)];
    self.enabledSwitch.buttonType = NSButtonTypeSwitch;
    self.enabledSwitch.title = @"启用皮肤与布局";
    self.enabledSwitch.target = self;
    self.enabledSwitch.action = @selector(settingsChanged:);
    self.enabledSwitch.contentTintColor = [NSColor colorWithWhite:0.92 alpha:1];
    [root addSubview:self.enabledSwitch];

    self.restartButton = [self button:@"重新启动 Codex" frame:NSMakeRect(568, 45, 168, 36) action:@selector(restartCodex:) primary:YES];
    [root addSubview:self.restartButton];
    NSTextField *footer = [self label:@"启动器需保持运行。重启 Codex 会结束其中正在运行的任务。" frame:NSMakeRect(29, 21, 600, 20) size:12 weight:NSFontWeightRegular];
    footer.textColor = [NSColor colorWithWhite:0.56 alpha:1];
    [root addSubview:footer];
}

- (NSSlider *)addSlider:(NSString *)title
                    row:(NSInteger)row
                    min:(double)minimum
                    max:(double)maximum
                 toView:(NSView *)view
             valueLabel:(NSTextField * __strong *)valueLabel {
    CGFloat y = 8 + row * 27;
    [view addSubview:[self label:title frame:NSMakeRect(10, y, 90, 20) size:12 weight:NSFontWeightRegular]];
    NSSlider *slider = [[NSSlider alloc] initWithFrame:NSMakeRect(104, y, 480, 20)];
    slider.minValue = minimum;
    slider.maxValue = maximum;
    slider.continuous = YES;
    slider.target = self;
    slider.action = @selector(settingsChanged:);
    [view addSubview:slider];
    NSTextField *value = [self label:@"" frame:NSMakeRect(595, y, 70, 20) size:12 weight:NSFontWeightMedium];
    value.alignment = NSTextAlignmentRight;
    [view addSubview:value];
    *valueLabel = value;
    return slider;
}

- (NSDictionary *)defaultSettings {
    return @{
        @"enabled": @YES,
        @"layoutTheme": @"original",
        @"selectedImagePath": @"",
        @"backgroundImagePath": @"",
        @"backgroundColor": @"#0D1117",
        @"foregroundColor": @"#E8EDF5",
        @"accentColor": @"#7C9CFF",
        @"overlayOpacity": @0.58,
        @"panelOpacity": @0.78,
        @"blurRadius": @3.0,
        @"brightness": @0.86,
        @"saturation": @0.92,
        @"imageFit": @"cover",
        @"uiFontFamily": @"",
        @"codeFontFamily": @""
    };
}

- (void)loadSettings {
    NSMutableDictionary *settings = [[self defaultSettings] mutableCopy];
    NSData *data = [NSData dataWithContentsOfFile:self.configPath];
    if (data) {
        NSDictionary *saved = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
        if ([saved isKindOfClass:NSDictionary.class]) [settings addEntriesFromDictionary:saved];
    }

    self.enabledSwitch.state = [settings[@"enabled"] boolValue] ? NSControlStateValueOn : NSControlStateValueOff;
    NSString *layoutTheme = settings[@"layoutTheme"] ?: @"original";
    NSInteger layoutIndex = [layoutTheme isEqualToString:@"wechat"] ? 1 : ([layoutTheme isEqualToString:@"feishu"] ? 2 : ([layoutTheme isEqualToString:@"qq2007"] ? 3 : 0));
    [self.layoutPicker selectItemAtIndex:layoutIndex];
    self.selectedImagePath = settings[@"selectedImagePath"] ?: @"";
    self.backgroundImagePath = settings[@"backgroundImagePath"] ?: @"";
    self.backgroundColorWell.color = [self colorFromHex:settings[@"backgroundColor"] fallback:@"#0D1117"];
    self.foregroundColorWell.color = [self colorFromHex:settings[@"foregroundColor"] fallback:@"#E8EDF5"];
    self.accentColorWell.color = [self colorFromHex:settings[@"accentColor"] fallback:@"#7C9CFF"];
    self.overlaySlider.doubleValue = [settings[@"overlayOpacity"] doubleValue];
    self.panelSlider.doubleValue = [settings[@"panelOpacity"] doubleValue];
    self.blurSlider.doubleValue = [settings[@"blurRadius"] doubleValue];
    self.brightnessSlider.doubleValue = [settings[@"brightness"] doubleValue];
    self.saturationSlider.doubleValue = [settings[@"saturation"] doubleValue];
    [self.fitPicker selectItemAtIndex:[settings[@"imageFit"] isEqualToString:@"contain"] ? 1 : 0];
    self.uiFontField.stringValue = settings[@"uiFontFamily"] ?: @"";
    self.codeFontField.stringValue = settings[@"codeFontFamily"] ?: @"";
    [self updatePreview];
    [self updateValueLabels];
}

- (void)settingsChanged:(id)sender {
    [self updateValueLabels];
    [self saveSettings];
}

- (void)controlTextDidChange:(NSNotification *)notification {
    [self saveSettings];
}

- (void)updateValueLabels {
    self.overlayValue.stringValue = [NSString stringWithFormat:@"%ld%%", lround(self.overlaySlider.doubleValue * 100)];
    self.panelValue.stringValue = [NSString stringWithFormat:@"%ld%%", lround(self.panelSlider.doubleValue * 100)];
    self.blurValue.stringValue = [NSString stringWithFormat:@"%ld px", lround(self.blurSlider.doubleValue)];
    self.brightnessValue.stringValue = [NSString stringWithFormat:@"%ld%%", lround(self.brightnessSlider.doubleValue * 100)];
    self.saturationValue.stringValue = [NSString stringWithFormat:@"%ld%%", lround(self.saturationSlider.doubleValue * 100)];
}

- (void)saveSettings {
    NSDictionary *settings = @{
        @"enabled": @(self.enabledSwitch.state == NSControlStateValueOn),
        @"layoutTheme": @[@"original", @"wechat", @"feishu", @"qq2007"][MAX(0, MIN(3, self.layoutPicker.indexOfSelectedItem))],
        @"selectedImagePath": self.selectedImagePath ?: @"",
        @"backgroundImagePath": self.backgroundImagePath ?: @"",
        @"backgroundColor": [self hexFromColor:self.backgroundColorWell.color],
        @"foregroundColor": [self hexFromColor:self.foregroundColorWell.color],
        @"accentColor": [self hexFromColor:self.accentColorWell.color],
        @"overlayOpacity": @(self.overlaySlider.doubleValue),
        @"panelOpacity": @(self.panelSlider.doubleValue),
        @"blurRadius": @(self.blurSlider.doubleValue),
        @"brightness": @(self.brightnessSlider.doubleValue),
        @"saturation": @(self.saturationSlider.doubleValue),
        @"imageFit": self.fitPicker.indexOfSelectedItem == 1 ? @"contain" : @"cover",
        @"uiFontFamily": self.uiFontField.stringValue ?: @"",
        @"codeFontFamily": self.codeFontField.stringValue ?: @""
    };
    NSData *data = [NSJSONSerialization dataWithJSONObject:settings options:NSJSONWritingPrettyPrinted error:nil];
    [data writeToFile:self.configPath options:NSDataWritingAtomic error:nil];
}

- (void)chooseWallpaper:(id)sender {
    NSOpenPanel *panel = [NSOpenPanel openPanel];
    panel.title = @"选择 Codex 背景图片";
    panel.prompt = @"选择图片";
    panel.canChooseFiles = YES;
    panel.canChooseDirectories = NO;
    panel.allowsMultipleSelection = NO;
    panel.allowedContentTypes = @[UTTypeImage];
    if ([panel runModal] != NSModalResponseOK || !panel.URL) return;

    NSError *error = nil;
    if (![self cacheWallpaper:panel.URL error:&error]) {
        [self setStatus:[NSString stringWithFormat:@"读取图片失败：%@", error.localizedDescription ?: @"未知错误"] state:@"error"];
        return;
    }
    self.selectedImagePath = panel.URL.path;
    self.backgroundImagePath = self.wallpaperPath;
    [self updatePreview];
    [self saveSettings];
    [self setStatus:@"背景图已更新，正在实时应用" state:@"connected"];
}

- (void)clearWallpaper:(id)sender {
    self.selectedImagePath = @"";
    self.backgroundImagePath = @"";
    [[NSFileManager defaultManager] removeItemAtPath:self.wallpaperPath error:nil];
    [self updatePreview];
    [self saveSettings];
}

- (BOOL)cacheWallpaper:(NSURL *)url error:(NSError **)error {
    NSImage *image = [[NSImage alloc] initWithContentsOfURL:url];
    if (!image) {
        if (error) *error = [NSError errorWithDomain:@"CodexSkinLauncher" code:1 userInfo:@{NSLocalizedDescriptionKey: @"无法识别该图片"}];
        return NO;
    }

    NSRect proposed = NSMakeRect(0, 0, image.size.width, image.size.height);
    CGImageRef source = [image CGImageForProposedRect:&proposed context:nil hints:nil];
    if (!source) return NO;
    CGFloat sourceWidth = CGImageGetWidth(source);
    CGFloat sourceHeight = CGImageGetHeight(source);
    CGFloat scale = MIN(1.0, 3000.0 / MAX(sourceWidth, sourceHeight));
    NSSize targetSize = NSMakeSize(MAX(1, floor(sourceWidth * scale)), MAX(1, floor(sourceHeight * scale)));

    NSImage *resized = [[NSImage alloc] initWithSize:targetSize];
    [resized lockFocus];
    [[self colorFromHex:[self hexFromColor:self.backgroundColorWell.color] fallback:@"#0D1117"] setFill];
    NSRectFill(NSMakeRect(0, 0, targetSize.width, targetSize.height));
    [NSGraphicsContext currentContext].imageInterpolation = NSImageInterpolationHigh;
    [image drawInRect:NSMakeRect(0, 0, targetSize.width, targetSize.height)
             fromRect:NSZeroRect
            operation:NSCompositingOperationSourceOver
             fraction:1.0];
    [resized unlockFocus];

    NSBitmapImageRep *bitmap = [[NSBitmapImageRep alloc] initWithData:resized.TIFFRepresentation];
    NSData *jpeg = [bitmap representationUsingType:NSBitmapImageFileTypeJPEG
                                        properties:@{NSImageCompressionFactor: @0.86}];
    if (!jpeg) return NO;
    return [jpeg writeToFile:self.wallpaperPath options:NSDataWritingAtomic error:error];
}

- (void)updatePreview {
    NSString *path = self.selectedImagePath.length ? self.selectedImagePath : self.backgroundImagePath;
    NSImage *image = path.length ? [[NSImage alloc] initWithContentsOfFile:path] : nil;
    self.imagePreview.image = image;
}

- (NSColor *)colorFromHex:(NSString *)hex fallback:(NSString *)fallback {
    NSString *value = [hex isKindOfClass:NSString.class] ? hex : fallback;
    value = [value stringByReplacingOccurrencesOfString:@"#" withString:@""];
    if (value.length != 6) value = [fallback stringByReplacingOccurrencesOfString:@"#" withString:@""];
    unsigned int rgb = 0;
    [[NSScanner scannerWithString:value] scanHexInt:&rgb];
    return [NSColor colorWithSRGBRed:((rgb >> 16) & 0xFF) / 255.0
                               green:((rgb >> 8) & 0xFF) / 255.0
                                blue:(rgb & 0xFF) / 255.0
                               alpha:1];
}

- (NSString *)hexFromColor:(NSColor *)color {
    NSColor *rgb = [color colorUsingColorSpace:NSColorSpace.sRGBColorSpace] ?: color;
    return [NSString stringWithFormat:@"#%02lX%02lX%02lX",
            lround(rgb.redComponent * 255),
            lround(rgb.greenComponent * 255),
            lround(rgb.blueComponent * 255)];
}

- (NSURL *)codexApplicationURL {
    NSArray<NSString *> *paths = @[
        @"/Applications/ChatGPT.app",
        @"/Applications/Codex.app",
        [NSHomeDirectory() stringByAppendingPathComponent:@"Applications/ChatGPT.app"],
        [NSHomeDirectory() stringByAppendingPathComponent:@"Applications/Codex.app"]
    ];
    for (NSString *path in paths) {
        NSBundle *bundle = [NSBundle bundleWithPath:path];
        if ([[bundle bundleIdentifier] isEqualToString:CodexBundleIdentifier]) return [NSURL fileURLWithPath:path];
    }
    return nil;
}

- (void)restartCodex:(id)sender {
    if (!self.restartButton.enabled) return;
    NSURL *appURL = [self codexApplicationURL];
    if (!appURL) {
        [self setStatus:@"没有找到 Codex（ChatGPT.app）" state:@"error"];
        return;
    }

    [self saveSettings];
    [self stopInjector];
    self.restartButton.enabled = NO;
    [self setStatus:@"正在自动启动 Codex…" state:@"waiting"];

    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        NSArray<NSRunningApplication *> *running = [NSRunningApplication runningApplicationsWithBundleIdentifier:CodexBundleIdentifier];
        for (NSRunningApplication *application in running) [application terminate];
        for (NSInteger attempt = 0; attempt < 16; attempt++) {
            if ([NSRunningApplication runningApplicationsWithBundleIdentifier:CodexBundleIdentifier].count == 0) break;
            usleep(250000);
        }
        for (NSRunningApplication *application in [NSRunningApplication runningApplicationsWithBundleIdentifier:CodexBundleIdentifier]) {
            [application forceTerminate];
        }
        usleep(700000);

        dispatch_async(dispatch_get_main_queue(), ^{
            NSWorkspaceOpenConfiguration *configuration = [NSWorkspaceOpenConfiguration configuration];
            configuration.arguments = @[
                @"--remote-debugging-address=127.0.0.1",
                [NSString stringWithFormat:@"--remote-debugging-port=%ld", (long)DebuggingPort]
            ];
            configuration.activates = YES;
            [[NSWorkspace sharedWorkspace] openApplicationAtURL:appURL
                                                  configuration:configuration
                                              completionHandler:^(NSRunningApplication *application, NSError *error) {
                dispatch_async(dispatch_get_main_queue(), ^{
                    self.restartButton.enabled = YES;
                    if (error || !application) {
                        [self setStatus:[NSString stringWithFormat:@"Codex 启动失败：%@", error.localizedDescription ?: @"未知错误"] state:@"error"];
                        return;
                    }
                    NSError *injectorError = nil;
                    if (![self startInjectorForCodexURL:appURL error:&injectorError]) {
                        [self setStatus:[NSString stringWithFormat:@"注入器启动失败：%@", injectorError.localizedDescription] state:@"error"];
                    } else {
                        [self setStatus:@"Codex 已启动，正在注入皮肤…" state:@"waiting"];
                    }
                });
            }];
        });
    });
}

- (BOOL)startInjectorForCodexURL:(NSURL *)appURL error:(NSError **)error {
    NSString *nodePath = [appURL.path stringByAppendingPathComponent:@"Contents/Resources/cua_node/bin/node"];
    NSString *scriptPath = [[NSBundle mainBundle] pathForResource:@"skin-injector" ofType:@"js"];
    if (![[NSFileManager defaultManager] isExecutableFileAtPath:nodePath] || !scriptPath) {
        if (error) *error = [NSError errorWithDomain:@"CodexSkinLauncher" code:2 userInfo:@{NSLocalizedDescriptionKey: @"Codex 内置运行环境或注入器资源缺失"}];
        return NO;
    }

    NSTask *task = [[NSTask alloc] init];
    task.executableURL = [NSURL fileURLWithPath:nodePath];
    task.arguments = @[
        scriptPath,
        @"--config", self.configPath,
        @"--status", self.statusPath,
        @"--port", [NSString stringWithFormat:@"%ld", (long)DebuggingPort],
        @"--parent-pid", [NSString stringWithFormat:@"%d", NSProcessInfo.processInfo.processIdentifier]
    ];
    task.currentDirectoryURL = [NSURL fileURLWithPath:self.supportDirectory];
    task.standardOutput = NSFileHandle.fileHandleWithNullDevice;
    task.standardError = NSFileHandle.fileHandleWithNullDevice;
    if (![task launchAndReturnError:error]) return NO;
    self.injectorTask = task;
    return YES;
}

- (void)stopInjector {
    if (self.injectorTask.running) [self.injectorTask terminate];
    self.injectorTask = nil;
}

- (void)refreshStatus {
    NSData *data = [NSData dataWithContentsOfFile:self.statusPath];
    if (!data) return;
    NSDictionary *status = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
    if (![status isKindOfClass:NSDictionary.class]) return;
    NSString *state = status[@"state"] ?: @"waiting";
    NSString *message = status[@"message"] ?: @"";
    NSString *detail = status[@"lastError"];
    if ([state isEqualToString:@"error"] && detail.length) message = [message stringByAppendingFormat:@"：%@", detail];
    [self setStatus:message state:state];
}

- (void)setStatus:(NSString *)text state:(NSString *)state {
    self.statusLabel.stringValue = text ?: @"";
    if ([state isEqualToString:@"connected"]) {
        self.statusLabel.textColor = [NSColor colorWithSRGBRed:0.35 green:0.86 blue:0.55 alpha:1];
    } else if ([state isEqualToString:@"error"]) {
        self.statusLabel.textColor = [NSColor colorWithSRGBRed:1 green:0.38 blue:0.38 alpha:1];
    } else {
        self.statusLabel.textColor = [NSColor colorWithSRGBRed:1 green:0.72 blue:0.30 alpha:1];
    }
}

@end

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        NSApplication *application = [NSApplication sharedApplication];
        AppDelegate *delegate = [[AppDelegate alloc] init];
        application.delegate = delegate;
        [application run];
    }
    return 0;
}
