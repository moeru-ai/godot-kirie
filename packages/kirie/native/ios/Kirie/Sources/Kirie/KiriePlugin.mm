#include "KiriePlugin.h"

#include <cstring>

#import <Foundation/Foundation.h>

extern "C" void kirie_swift_create_webview(const char *initial_url);
extern "C" void kirie_swift_destroy_webview(void);
extern "C" void kirie_swift_load_url(const char *url);
extern "C" void kirie_swift_load_html_string(const char *html, const char *base_url);
extern "C" void kirie_swift_send_ipc_message(const char *message_json);
extern "C" void kirie_swift_send_text(const char *message);
extern "C" void kirie_swift_send_binary(const uint8_t *bytes, intptr_t byte_count);
extern "C" void kirie_swift_send_data_json(const char *json);

static NSString *const KirieWebViewReadyNotification = @"KirieWebViewReady";
static NSString *const KirieIpcMessageReceivedNotification = @"KirieIpcMessageReceived";
static NSString *const KirieTextReceivedNotification = @"KirieTextReceived";
static NSString *const KirieBinaryReceivedNotification = @"KirieBinaryReceived";
static NSString *const KirieDataReceivedNotification = @"KirieDataReceived";
static NSString *const KirieIpcErrorNotification = @"KirieIpcError";
static const char *DATA_VALUE_KEY = "value";

static KiriePlugin *singleton = nullptr;

static String to_godot_string(id value) {
	if (![value isKindOfClass:[NSString class]]) {
		return String();
	}

	return String::utf8([(NSString *)value UTF8String]);
}

static PackedByteArray to_godot_bytes(id value) {
	PackedByteArray bytes;
	if (![value isKindOfClass:[NSData class]]) {
		return bytes;
	}

	NSData *data = (NSData *)value;
	bytes.resize(data.length);
	if (data.length > 0) {
		std::memcpy(bytes.ptrw(), data.bytes, data.length);
	}

	return bytes;
}

static Variant to_godot_variant(id value) {
	if (!value || value == [NSNull null]) {
		return Variant();
	}

	if ([value isKindOfClass:[NSString class]]) {
		return to_godot_string(value);
	}

	if ([value isKindOfClass:[NSNumber class]]) {
		NSNumber *number = (NSNumber *)value;
		if (CFGetTypeID((__bridge CFTypeRef)number) == CFBooleanGetTypeID()) {
			return Variant([number boolValue]);
		}

		CFNumberType number_type = CFNumberGetType((CFNumberRef)number);
		switch (number_type) {
			case kCFNumberFloat32Type:
			case kCFNumberFloat64Type:
			case kCFNumberFloatType:
			case kCFNumberDoubleType:
			case kCFNumberCGFloatType:
				return Variant([number doubleValue]);
			default:
				return Variant((int64_t)[number longLongValue]);
		}
	}

	if ([value isKindOfClass:[NSArray class]]) {
		Array array;
		for (id item in (NSArray *)value) {
			array.append(to_godot_variant(item));
		}
		return array;
	}

	if ([value isKindOfClass:[NSDictionary class]]) {
		Dictionary dictionary;
		for (id key in (NSDictionary *)value) {
			if (![key isKindOfClass:[NSString class]]) {
				continue;
			}

			dictionary[to_godot_string(key)] = to_godot_variant([(NSDictionary *)value objectForKey:key]);
		}
		return dictionary;
	}

	return Variant();
}

static id to_foundation_object(const Variant &value, String *error) {
	switch (value.get_type()) {
		case Variant::NIL:
			return [NSNull null];
		case Variant::BOOL:
			return [NSNumber numberWithBool:bool(value)];
		case Variant::INT:
			return [NSNumber numberWithLongLong:(long long)(int64_t)value];
		case Variant::FLOAT:
			return [NSNumber numberWithDouble:(double)value];
		case Variant::STRING: {
			CharString string_value = String(value).utf8();
			return [NSString stringWithUTF8String:string_value.get_data()];
		}
		case Variant::ARRAY: {
			Array source = value;
			NSMutableArray *array = [NSMutableArray arrayWithCapacity:source.size()];
			for (int64_t index = 0; index < source.size(); index++) {
				id item = to_foundation_object(source[index], error);
				if (error && !error->is_empty()) {
					return nil;
				}
				[array addObject:item ?: [NSNull null]];
			}
			return array;
		}
		case Variant::DICTIONARY: {
			Dictionary source = value;
			NSMutableDictionary *dictionary = [NSMutableDictionary dictionaryWithCapacity:source.size()];
			Array keys = source.keys();
			for (int64_t index = 0; index < keys.size(); index++) {
				Variant key = keys[index];
				if (key.get_type() != Variant::STRING) {
					if (error) {
						*error = String("Kirie data maps only support string keys");
					}
					return nil;
				}

				CharString key_string = String(key).utf8();
				id item = to_foundation_object(source[key], error);
				if (error && !error->is_empty()) {
					return nil;
				}
				[dictionary setObject:item ?: [NSNull null]
					forKey:[NSString stringWithUTF8String:key_string.get_data()]];
			}
			return dictionary;
		}
		default:
			if (error) {
				*error = String("Unsupported Kirie data type: ") + Variant::get_type_name(value.get_type());
			}
			return nil;
	}
}

static String to_json_string(const Variant &value, String *error) {
	id object = to_foundation_object(value, error);
	if (error && !error->is_empty()) {
		return String();
	}

	NSError *json_error = nil;
	NSData *data = [NSJSONSerialization dataWithJSONObject:object
		options:NSJSONWritingFragmentsAllowed
		error:&json_error];
	if (json_error) {
		if (error) {
			*error = to_godot_string(json_error.localizedDescription);
		}
		return String();
	}

	NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
	return to_godot_string(json);
}

static Variant unwrap_carried_data(Variant value) {
	if (value.get_type() != Variant::DICTIONARY) {
		return value;
	}

	Dictionary dictionary = value;
	String key = String(DATA_VALUE_KEY);
	if (!dictionary.has(key)) {
		return value;
	}

	return dictionary[key];
}

static bool require_arg_count(Callable::CallError &r_error, int p_argcount, int p_expected) {
	if (p_argcount == p_expected) {
		return true;
	}

	r_error.error = p_argcount < p_expected ? Callable::CallError::CALL_ERROR_TOO_FEW_ARGUMENTS : Callable::CallError::CALL_ERROR_TOO_MANY_ARGUMENTS;
	r_error.expected = p_expected;
	return false;
}

static void call_callback(const Callable &callback) {
	if (callback.is_null()) {
		return;
	}

	Variant return_value;
	Callable::CallError call_error;
	callback.callp(nullptr, 0, return_value, call_error);
}

static void call_callback(const Callable &callback, const String &value) {
	if (callback.is_null()) {
		return;
	}

	Variant argument = value;
	const Variant *arguments[] = { &argument };
	Variant return_value;
	Callable::CallError call_error;
	callback.callp(arguments, 1, return_value, call_error);
}

static void call_callback(const Callable &callback, const PackedByteArray &value) {
	if (callback.is_null()) {
		return;
	}

	Variant argument = value;
	const Variant *arguments[] = { &argument };
	Variant return_value;
	Callable::CallError call_error;
	callback.callp(arguments, 1, return_value, call_error);
}

static void call_callback(const Callable &callback, const Variant &value) {
	if (callback.is_null()) {
		return;
	}

	const Variant *arguments[] = { &value };
	Variant return_value;
	Callable::CallError call_error;
	callback.callp(arguments, 1, return_value, call_error);
}

void KiriePlugin::registerCallbacks(Callable on_webview_ready, Callable on_text_received, Callable on_binary_received, Callable on_data_received, Callable on_ipc_error) {
	webview_ready_callback = on_webview_ready;
	ipc_message_received_callback = on_text_received;
	text_received_callback = on_text_received;
	binary_received_callback = on_binary_received;
	data_received_callback = on_data_received;
	ipc_error_callback = on_ipc_error;
}

void KiriePlugin::createWebView(String initial_url) {
	CharString encoded_initial_url = initial_url.utf8();
	kirie_swift_create_webview(encoded_initial_url.get_data());
}

void KiriePlugin::destroyWebView() {
	kirie_swift_destroy_webview();
}

void KiriePlugin::loadUrl(String url) {
	CharString encoded_url = url.utf8();
	kirie_swift_load_url(encoded_url.get_data());
}

void KiriePlugin::loadHtmlString(String html, String base_url) {
	CharString encoded_html = html.utf8();
	CharString encoded_base_url = base_url.utf8();
	kirie_swift_load_html_string(encoded_html.get_data(), encoded_base_url.get_data());
}

void KiriePlugin::sendIpcMessage(String message_json) {
	CharString encoded_message_json = message_json.utf8();
	kirie_swift_send_ipc_message(encoded_message_json.get_data());
}

void KiriePlugin::sendText(String message) {
	CharString encoded_message = message.utf8();
	kirie_swift_send_text(encoded_message.get_data());
}

void KiriePlugin::sendBinary(PackedByteArray bytes) {
	kirie_swift_send_binary(bytes.ptr(), bytes.size());
}

void KiriePlugin::sendData(Variant value) {
	String error;
	String json = to_json_string(unwrap_carried_data(value), &error);
	if (!error.is_empty()) {
		call_callback(ipc_error_callback, error);
		return;
	}

	CharString encoded_json = json.utf8();
	kirie_swift_send_data_json(encoded_json.get_data());
}

String KiriePlugin::getLaunchOption(String key) {
	CharString encoded_key = key.utf8();
	NSString *underscore_key = [NSString stringWithUTF8String:encoded_key.get_data()];
	NSString *dash_key = [underscore_key stringByReplacingOccurrencesOfString:@"_" withString:@"-"];
	NSArray<NSString *> *arguments = [[NSProcessInfo processInfo] arguments];

	for (NSUInteger index = 0; index < arguments.count; index++) {
		NSString *argument = arguments[index];
		NSArray<NSString *> *option_names = @[ underscore_key, dash_key ];

		for (NSString *option_name in option_names) {
			NSString *prefix = [NSString stringWithFormat:@"--%@=", option_name];
			if ([argument hasPrefix:prefix]) {
				return to_godot_string([argument substringFromIndex:prefix.length]);
			}

			if ([argument isEqualToString:[NSString stringWithFormat:@"--%@", option_name]]
				&& index + 1 < arguments.count) {
				return to_godot_string(arguments[index + 1]);
			}
		}
	}

	return String();
}

KiriePlugin *KiriePlugin::get_singleton() {
	return singleton;
}

Variant KiriePlugin::callp(const StringName &p_method, const Variant **p_args, int p_argcount, Callable::CallError &r_error) {
	r_error.error = Callable::CallError::CALL_OK;

	if (p_method == StringName("createWebView")) {
		if (!require_arg_count(r_error, p_argcount, 1)) {
			return Variant();
		}

		createWebView(String(*p_args[0]));
		return Variant();
	}

	if (p_method == StringName("registerCallbacks")) {
		if (!require_arg_count(r_error, p_argcount, 5)) {
			return Variant();
		}

		registerCallbacks(Callable(*p_args[0]), Callable(*p_args[1]), Callable(*p_args[2]), Callable(*p_args[3]), Callable(*p_args[4]));
		return Variant();
	}

	if (p_method == StringName("destroyWebView")) {
		if (!require_arg_count(r_error, p_argcount, 0)) {
			return Variant();
		}

		destroyWebView();
		return Variant();
	}

	if (p_method == StringName("loadUrl")) {
		if (!require_arg_count(r_error, p_argcount, 1)) {
			return Variant();
		}

		loadUrl(String(*p_args[0]));
		return Variant();
	}

	if (p_method == StringName("loadHtmlString")) {
		if (!require_arg_count(r_error, p_argcount, 2)) {
			return Variant();
		}

		loadHtmlString(String(*p_args[0]), String(*p_args[1]));
		return Variant();
	}

	if (p_method == StringName("sendIpcMessage")) {
		if (!require_arg_count(r_error, p_argcount, 1)) {
			return Variant();
		}

		sendIpcMessage(String(*p_args[0]));
		return Variant();
	}

	if (p_method == StringName("sendText")) {
		if (!require_arg_count(r_error, p_argcount, 1)) {
			return Variant();
		}

		sendText(String(*p_args[0]));
		return Variant();
	}

	if (p_method == StringName("sendBinary")) {
		if (!require_arg_count(r_error, p_argcount, 1)) {
			return Variant();
		}

		sendBinary(PackedByteArray(*p_args[0]));
		return Variant();
	}

	if (p_method == StringName("sendData")) {
		if (!require_arg_count(r_error, p_argcount, 1)) {
			return Variant();
		}

		sendData(Variant(*p_args[0]));
		return Variant();
	}

	if (p_method == StringName("getLaunchOption")) {
		if (!require_arg_count(r_error, p_argcount, 1)) {
			return Variant();
		}

		return getLaunchOption(String(*p_args[0]));
	}

	return Object::callp(p_method, p_args, p_argcount, r_error);
}

KiriePlugin::KiriePlugin() {
	singleton = this;

	NSNotificationCenter *center = [NSNotificationCenter defaultCenter];
	NSOperationQueue *main_queue = [NSOperationQueue mainQueue];

	webview_ready_observer = (__bridge_retained void *)[center addObserverForName:KirieWebViewReadyNotification
		object:nil
		queue:main_queue
		usingBlock:^(__unused NSNotification *notification) {
			if (singleton) {
				call_callback(singleton->webview_ready_callback);
			}
		}];

	ipc_message_received_observer = (__bridge_retained void *)[center addObserverForName:KirieIpcMessageReceivedNotification
		object:nil
		queue:main_queue
		usingBlock:^(NSNotification *notification) {
			if (singleton) {
				call_callback(singleton->ipc_message_received_callback, to_godot_string(notification.object));
			}
		}];

	text_received_observer = (__bridge_retained void *)[center addObserverForName:KirieTextReceivedNotification
		object:nil
		queue:main_queue
		usingBlock:^(NSNotification *notification) {
			if (singleton) {
				call_callback(singleton->text_received_callback, to_godot_string(notification.object));
			}
		}];

	binary_received_observer = (__bridge_retained void *)[center addObserverForName:KirieBinaryReceivedNotification
		object:nil
		queue:main_queue
		usingBlock:^(NSNotification *notification) {
			if (singleton) {
				call_callback(singleton->binary_received_callback, to_godot_bytes(notification.object));
			}
		}];

	data_received_observer = (__bridge_retained void *)[center addObserverForName:KirieDataReceivedNotification
		object:nil
		queue:main_queue
		usingBlock:^(NSNotification *notification) {
			if (singleton) {
				call_callback(singleton->data_received_callback, to_godot_variant(notification.object));
			}
		}];

	ipc_error_observer = (__bridge_retained void *)[center addObserverForName:KirieIpcErrorNotification
		object:nil
		queue:main_queue
		usingBlock:^(NSNotification *notification) {
			if (singleton) {
				call_callback(singleton->ipc_error_callback, to_godot_string(notification.object));
			}
		}];
}

KiriePlugin::~KiriePlugin() {
	NSNotificationCenter *center = [NSNotificationCenter defaultCenter];

	if (webview_ready_observer) {
		id observer = (__bridge_transfer id)webview_ready_observer;
		[center removeObserver:observer];
		webview_ready_observer = nullptr;
	}

	if (ipc_message_received_observer) {
		id observer = (__bridge_transfer id)ipc_message_received_observer;
		[center removeObserver:observer];
		ipc_message_received_observer = nullptr;
	}

	if (text_received_observer) {
		id observer = (__bridge_transfer id)text_received_observer;
		[center removeObserver:observer];
		text_received_observer = nullptr;
	}

	if (binary_received_observer) {
		id observer = (__bridge_transfer id)binary_received_observer;
		[center removeObserver:observer];
		binary_received_observer = nullptr;
	}

	if (data_received_observer) {
		id observer = (__bridge_transfer id)data_received_observer;
		[center removeObserver:observer];
		data_received_observer = nullptr;
	}

	if (ipc_error_observer) {
		id observer = (__bridge_transfer id)ipc_error_observer;
		[center removeObserver:observer];
		ipc_error_observer = nullptr;
	}

	singleton = nullptr;
}
