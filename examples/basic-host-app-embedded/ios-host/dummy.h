#pragma once

#import <UIKit/UIKit.h>

@class GDTViewController;

@interface GDTApplicationDelegate : NSObject <UIApplicationDelegate, UIWindowSceneDelegate>
@end

@interface GDTAppDelegateService : NSObject <UIApplicationDelegate, UIWindowSceneDelegate>
@property(strong, class, nonatomic) GDTViewController *viewController;
@end

@interface GDTViewController : UIViewController
@end

FOUNDATION_EXPORT void kirie_attach_host_view(UIView *host_view);
FOUNDATION_EXPORT void kirie_detach_host_view(UIView *host_view);
