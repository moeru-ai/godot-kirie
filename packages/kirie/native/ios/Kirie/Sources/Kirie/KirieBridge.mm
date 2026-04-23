#import <Foundation/Foundation.h>

#import "KiriePlugin.h"

#if VERSION_MAJOR == 4
#import "core/config/engine.h"
#else
#import "core/engine.h"
#endif

extern "C" void kirie_swift_init(void);
extern "C" void kirie_swift_deinit(void);

static KiriePlugin *plugin = nullptr;

void init_kirie() {
    NSLog(@"[Kirie][TRACE-2026-03-19-13:33Z] init_kirie() bridge entry");
    plugin = memnew(KiriePlugin);
    Engine::get_singleton()->add_singleton(Engine::Singleton("Kirie", plugin));
    kirie_swift_init();
}

void deinit_kirie() {
    NSLog(@"[Kirie][TRACE-2026-03-19-13:33Z] deinit_kirie() bridge entry");
    kirie_swift_deinit();
    if (plugin) {
        memdelete(plugin);
        plugin = nullptr;
    }
}
