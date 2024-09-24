plugins {
    id("application")
}

repositories {
    mavenCentral()
}

dependencies {
    testImplementation("io.rest-assured:rest-assured:4.4.0")
    testImplementation("junit:junit:4.13.2")
}

application {
    mainClass.set("testAutomationAPIBa3.App")
}

java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(14))
    }
}
