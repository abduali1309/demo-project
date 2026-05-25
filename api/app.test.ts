// Arrange, ACT and Assert

beforeAll(()=>{
    console.log("Before all tests");
})

afterAll(()=>{
    console.log("After all tests");
})


describe("Sum two numbers", () => {
    // test1
    test("Should return the addition of two numbers", () => {
        const result = sum(4, 5);
        // expect(result).toBe(6);
        expect(result).toBeGreaterThan(6);
        expect(result).not.toEqual(6);
    });

    test("Confirming truthy values", () => {
        expect(3<=3).toBeTruthy();
    });

});


describe("Testing the sum function", () => {
    test("It should return a json object", async () => {
        const data = await fetchData();
        expect(data).toEqual({userId:1, title:"delectus aut autem",completed: false,id: 1});

    });

    test('object assignment', () => {
        const data: { [key: string]: number } = {one: 1};
        data['two'] = 2;
        expect(data).toEqual({one: 1, two: 2});
    });
})

const shoppingList = [
  'diapers',
  'kleenex',
  'trash bags',
  'paper towels',
  'milk',
];

test('the shopping list has milk on it', () => {
  expect(shoppingList).toContain('milk');
  expect(new Set(shoppingList)).toContain('milk');
});


function sum(a: number, b: number): number {
    return a + b;
}


async function fetchData(): Promise<string>{
    const response = await fetch("https://jsonplaceholder.typicode.com/todos/1");
    return response.json();
}