#import <Foundation/Foundation.h>

#import "KiriePlugin.h"

#if VERSION_MAJOR == 4
#import "core/config/engine.h"
#else
#import "core/engine.h"
#endif
#import "core/object/class_db.h"

extern "C" void kirie_swift_init(void);
extern "C" void kirie_swift_deinit(void);

static KiriePlugin *plugin = nullptr;

void init_kirie() {
	GDREGISTER_CLASS(KiriePlugin);
	plugin = memnew(KiriePlugin);
	Engine::get_singleton()->add_singleton(Engine::Singleton("Kirie", plugin));
	kirie_swift_init();
}

void deinit_kirie() {
    kirie_swift_deinit();
    if (plugin) {
        memdelete(plugin);
        plugin = nullptr;
    }
}
