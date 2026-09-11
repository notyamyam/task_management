import { useState, useEffect } from "react";

import { Check, Pencil, Trash, Save } from "lucide-react";
import { toast } from "react-toastify";

import { ENDPOINTS, instance } from "./api";

const Task = () => {
  const [tasks, setTasks] = useState([]);
  const [inputTask, setInputTask] = useState("");

  const [editable, setEditable] = useState(null);

  const addTask = async () => {
    await instance
      .post(ENDPOINTS.CREATE_TASK(), { title: inputTask })
      .then(() => {
        toast.success("Task added successfully.");
        setInputTask("");
        getAllTasks();
      });
  };

  const editTask = (e, id) => {
    setTasks((items) =>
      items.map((item) =>
        item.id === id ? { ...item, title: e.target.value } : item,
      ),
    );
  };

  const saveTask = async (id) => {
    const task = tasks.filter((task) => task.id === id)[0];
    await instance
      .put(ENDPOINTS.UPDATE_TASK(id), task)
      .then(() => {
        toast.success("Task updated successfully.");
        setEditable(null);
        getAllTasks();
      })
      .catch((err) => {
        console.log(err);
      });
  };

  const completeTask = async (id) => {
    const task = tasks.filter((task) => task.id === id)[0];
    task.completed = !task.completed;

    await instance
      .put(ENDPOINTS.UPDATE_TASK(id), task)
      .then(() => {
        toast.success("Task completed successfully.");
        getAllTasks();
      })
      .catch((err) => {
        console.log(err);
        toast.error("Error completing task.");
      });
  };

  const deleteTask = async (id) => {
    await instance
      .delete(ENDPOINTS.DELETE_TASK(id))
      .then(() => {
        toast.success("Task deleted successfully");
        getAllTasks();
      })
      .catch((err) => {
        console.log(err);
      });
  };

  const getAllTasks = async () => {
    await instance
      .get(ENDPOINTS.GET_TASKS())
      .then((res) => {
        setTasks(res.data);
      })
      .catch((err) => {
        console.log(err);
      });
  };

  useEffect(() => {
    getAllTasks();
  }, []);

  return (
    <>
      <div className="tasks-page">
        <div className="input-box">
          <input
            type="text"
            value={inputTask}
            onChange={(e) => setInputTask(e.target.value)}
            aria-label="New task title"
            placeholder="Add a task"
          />
          <button type="button" className="add" onClick={addTask}>
            Add
          </button>
        </div>
        <div className="task-container">
          {tasks.map((item) => {
            return (
              <div
                key={item.id}
                className="task-items"
                style={{ backgroundColor: item.completed ? "#d3ffd3" : "#fff" }}
              >
                <div className="task-title">
                  <div className="task-content">
                    <label className="title" htmlFor={`task-${item.id}`}>Title: </label>
                    <input
                      id={`task-${item.id}`}
                      className="task-edit-input"
                      type="text"
                      value={item.title}
                      disabled={editable !== item.id}
                      onChange={(e) => editTask(e, item.id)}
                    />
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={item.completed ? "Mark task incomplete" : "Mark task complete"}
                    onClick={() => completeTask(item.id)}
                  >
                    <Check aria-hidden="true" size={20} />
                  </button>
                </div>
                <div className="icon-group">
                  {editable !== item.id ? (
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Edit task"
                      onClick={() => setEditable(item.id)}
                    >
                      <Pencil aria-hidden="true" size={20} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Save task"
                      onClick={() => saveTask(item.id)}
                    >
                      <Save aria-hidden="true" size={20} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Delete task"
                    onClick={() => deleteTask(item.id)}
                  >
                    <Trash aria-hidden="true" size={20} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};

export default Task;
