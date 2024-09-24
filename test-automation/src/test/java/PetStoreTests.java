import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import org.junit.Test;

import static io.restassured.RestAssured.*;
import static org.hamcrest.Matchers.*;

public class PetStoreTests {

    @Test
    public void testGetPets() {
        given().
            when().
            get("https://petstore.swagger.io/v2/pet/findByStatus?status=available").
            then().
            statusCode(200).
            body("status", hasItem("available"));
    }

    @Test
    public void testCreatePet() {
        String newPet = "{\"id\": 12345, \"name\": \"MyPet\", \"status\": \"available\"}";
        given().
            contentType(ContentType.JSON).
            body(newPet).
            when().
            post("https://petstore.swagger.io/v2/pet").
            then().
            statusCode(200).
            body("id", equalTo(12345));
    }

    @Test
    public void testUpdatePet() {
        String updatedPet = "{\"id\": 12345, \"name\": \"UpdatedPet\", \"status\": \"sold\"}";
        given().
            contentType(ContentType.JSON).
            body(updatedPet).
            when().
            put("https://petstore.swagger.io/v2/pet").
            then().
            statusCode(200).
            body("name", equalTo("UpdatedPet"));
    }

    @Test
    public void testDeletePet() {
        given().
            when().
            delete("https://petstore.swagger.io/v2/pet/12345").
            then().
            statusCode(200);
    }
}
